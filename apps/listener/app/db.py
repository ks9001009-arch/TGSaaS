import uuid
from urllib.parse import urlsplit, urlunsplit

import asyncpg

from .config import DATABASE_URL
from .crypto import decrypt_secret


def _dsn(url: str) -> str:
    # asyncpg does not understand the ?schema=public query Prisma appends.
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _cuid() -> str:
    # Prisma uses cuid; any unique text PK works for rows we create here.
    return "l" + uuid.uuid4().hex


class Database:
    def __init__(self) -> None:
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        if self.pool is None:
            self.pool = await asyncpg.create_pool(dsn=_dsn(DATABASE_URL), min_size=1, max_size=5)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()
            self.pool = None

    # ---------- system settings ----------
    async def get_telegram_api(self) -> tuple[int | None, str | None]:
        rows = await self.pool.fetch(
            'SELECT key, value, encrypted FROM "SystemSetting" WHERE key IN ($1, $2)',
            "telegram.api_id",
            "telegram.api_hash",
        )
        api_id = None
        api_hash = None
        for r in rows:
            val = decrypt_secret(r["value"]) if r["encrypted"] else r["value"]
            if r["key"] == "telegram.api_id" and val:
                try:
                    api_id = int(val)
                except ValueError:
                    api_id = None
            elif r["key"] == "telegram.api_hash":
                api_hash = val or None
        return api_id, api_hash

    # ---------- accounts ----------
    async def fetch_accounts(self, enabled_only: bool = True) -> list[asyncpg.Record]:
        q = 'SELECT id, "tenantId", phone, label, "sessionPath", "loginStatus", enabled FROM "ListenerAccount"'
        if enabled_only:
            q += " WHERE enabled = true"
        return await self.pool.fetch(q)

    async def fetch_account(self, account_id: str) -> asyncpg.Record | None:
        return await self.pool.fetchrow(
            'SELECT id, "tenantId", phone, label, "sessionPath", "loginStatus", enabled FROM "ListenerAccount" WHERE id = $1',
            account_id,
        )

    async def update_account(self, account_id: str, **fields) -> None:
        if not fields:
            return
        cols = []
        vals = []
        i = 1
        for k, v in fields.items():
            cols.append(f'"{k}" = ${i}')
            vals.append(v)
            i += 1
        vals.append(account_id)
        await self.pool.execute(
            f'UPDATE "ListenerAccount" SET {", ".join(cols)}, "updatedAt" = now() WHERE id = ${i}',
            *vals,
        )

    # ---------- groups ----------
    async def fetch_listening_groups(self) -> list[asyncpg.Record]:
        return await self.pool.fetch(
            'SELECT "accountId", "tgChatId" FROM "ListenerGroup" WHERE listening = true'
        )

    async def upsert_group(
        self, tenant_id: str, account_id: str, tg_chat_id: str, title: str, username: str | None, gtype: str
    ) -> None:
        await self.pool.execute(
            '''INSERT INTO "ListenerGroup" (id, "tenantId", "accountId", "tgChatId", title, username, type, listening, "createdAt", "updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,false, now(), now())
               ON CONFLICT ("accountId","tgChatId")
               DO UPDATE SET title = EXCLUDED.title, username = EXCLUDED.username, type = EXCLUDED.type, "updatedAt" = now()''',
            _cuid(), tenant_id, account_id, tg_chat_id, title or "", username, gtype,
        )

    async def touch_group(self, account_id: str, tg_chat_id: str) -> None:
        await self.pool.execute(
            'UPDATE "ListenerGroup" SET "lastMessageAt" = now() WHERE "accountId" = $1 AND "tgChatId" = $2',
            account_id, tg_chat_id,
        )

    # ---------- rules / targets ----------
    async def fetch_rules(self) -> list[asyncpg.Record]:
        return await self.pool.fetch(
            'SELECT id, "tenantId", scope, "accountId", "chatId", include, exclude, regex FROM "ListenerKeywordRule" WHERE enabled = true'
        )

    async def fetch_targets(self) -> list[asyncpg.Record]:
        return await self.pool.fetch(
            'SELECT id, "tenantId", type, "chatId", mode FROM "ListenerPushTarget" WHERE enabled = true'
        )

    # ---------- hits / push logs ----------
    async def insert_hit(self, **f) -> None:
        await self.pool.execute(
            '''INSERT INTO "ListenerHit"
               (id, "tenantId", "ruleId", "accountId", "sourceChatId", "sourceTitle", "sourceUsername",
                "senderId", "senderName", "senderUsername", "messageId", content, "messageLink", "matchedKeyword", "createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())''',
            _cuid(), f["tenantId"], f.get("ruleId"), f["accountId"], f["sourceChatId"], f.get("sourceTitle", ""),
            f.get("sourceUsername"), f.get("senderId"), f.get("senderName"), f.get("senderUsername"),
            f["messageId"], f.get("content", ""), f.get("messageLink"), f.get("matchedKeyword"),
        )

    async def claim_push(
        self, tenant_id: str, account_id: str, source_chat_id: str, message_id: str, target_id: str, mode: str
    ) -> str | None:
        """Atomically claim (sourceChatId, messageId, targetId). Returns the new
        log id if claimed (caller should send), or None if already pushed (dup)."""
        row = await self.pool.fetchrow(
            '''INSERT INTO "ListenerPushLog"
               (id, "tenantId", "accountId", "sourceChatId", "messageId", "targetId", mode, method, status, "createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,'FORWARD','SENT', now())
               ON CONFLICT ("sourceChatId","messageId","targetId") DO NOTHING
               RETURNING id''',
            _cuid(), tenant_id, account_id, source_chat_id, message_id, target_id, mode,
        )
        return row["id"] if row else None

    async def finish_push(self, log_id: str, method: str, status: str, fail_reason: str | None) -> None:
        await self.pool.execute(
            'UPDATE "ListenerPushLog" SET method = $1, status = $2, "failReason" = $3 WHERE id = $4',
            method, status, fail_reason, log_id,
        )


db = Database()
