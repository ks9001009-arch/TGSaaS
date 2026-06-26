import asyncio
import logging
import os
import re
from datetime import datetime, timezone

from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError

from .config import SESSION_DIR
from .db import db

log = logging.getLogger("listener.manager")


def _session_path(account_id: str) -> str:
    return os.path.join(SESSION_DIR, account_id)


class ListenerManager:
    def __init__(self) -> None:
        self.api_id: int | None = None
        self.api_hash: str | None = None
        self.clients: dict[str, TelegramClient] = {}
        self.accounts: dict[str, dict] = {}        # account_id -> {tenantId, phone, ...}
        self.locks: dict[str, asyncio.Lock] = {}
        # caches refreshed by reload()
        self.listening: dict[str, set[str]] = {}   # account_id -> {tgChatId}
        self.rules: list[dict] = []
        self.targets_by_tenant: dict[str, list[dict]] = {}

    def _lock(self, account_id: str) -> asyncio.Lock:
        if account_id not in self.locks:
            self.locks[account_id] = asyncio.Lock()
        return self.locks[account_id]

    async def load_api(self) -> None:
        self.api_id, self.api_hash = await db.get_telegram_api()

    def _ensure_api(self) -> None:
        if not self.api_id or not self.api_hash:
            raise RuntimeError("平台尚未配置 Telegram API ID / API Hash（系统中心 → Telegram API）")

    # ---------------- lifecycle ----------------

    async def start(self) -> None:
        await db.connect()
        await self.load_api()
        await self.reload()
        # auto-resume every enabled account that already has a saved session
        for acc in await db.fetch_accounts(enabled_only=True):
            try:
                await self._resume_account(acc)
            except Exception as e:  # noqa: BLE001
                log.warning("resume %s failed: %s", acc["id"], e)
                await db.update_account(acc["id"], onlineStatus="OFFLINE", lastError=str(e)[:480])

    async def _resume_account(self, acc) -> None:
        account_id = acc["id"]
        path = _session_path(account_id)
        if not os.path.exists(path + ".session"):
            return
        self._ensure_api()
        client = TelegramClient(path, self.api_id, self.api_hash)
        await client.connect()
        if await client.is_user_authorized():
            self.clients[account_id] = client
            self.accounts[account_id] = dict(acc)
            self._attach_handler(account_id, client)
            await db.update_account(
                account_id,
                loginStatus="LOGGED_IN",
                onlineStatus="ONLINE",
                sessionStatus="SAVED",
                sessionPath=path + ".session",
                lastConnectedAt=datetime.now(timezone.utc),
                lastError=None,
            )
            log.info("resumed account %s (%s)", account_id, acc["phone"])
        else:
            await client.disconnect()
            await db.update_account(account_id, onlineStatus="OFFLINE", sessionStatus="INVALID")

    # ---------------- caches ----------------

    async def reload(self) -> None:
        rows = await db.fetch_listening_groups()
        listening: dict[str, set[str]] = {}
        for r in rows:
            listening.setdefault(r["accountId"], set()).add(str(r["tgChatId"]))
        self.listening = listening

        self.rules = [dict(r) for r in await db.fetch_rules()]

        targets: dict[str, list[dict]] = {}
        for t in await db.fetch_targets():
            targets.setdefault(t["tenantId"], []).append(dict(t))
        self.targets_by_tenant = targets
        log.info(
            "reload: %d listening accounts, %d rules, %d tenants with targets",
            len(self.listening), len(self.rules), len(self.targets_by_tenant),
        )

    # ---------------- login flow ----------------

    async def send_code(self, account_id: str) -> dict:
        async with self._lock(account_id):
            self._ensure_api()
            acc = await db.fetch_account(account_id)
            if not acc:
                raise RuntimeError("账号不存在")
            path = _session_path(account_id)
            client = TelegramClient(path, self.api_id, self.api_hash)
            await client.connect()
            if await client.is_user_authorized():
                self.clients[account_id] = client
                self.accounts[account_id] = dict(acc)
                self._attach_handler(account_id, client)
                await db.update_account(account_id, loginStatus="LOGGED_IN", onlineStatus="ONLINE", sessionStatus="SAVED")
                return {"ok": True, "alreadyLoggedIn": True}
            await client.send_code_request(acc["phone"])
            self.clients[account_id] = client  # keep the client alive for confirm
            self.accounts[account_id] = dict(acc)
            await db.update_account(account_id, loginStatus="CODE_SENT", onlineStatus="CONNECTING", lastError=None)
            return {"ok": True, "codeSent": True}

    async def confirm_code(self, account_id: str, code: str) -> dict:
        async with self._lock(account_id):
            client = self.clients.get(account_id)
            acc = self.accounts.get(account_id)
            if acc is None:
                row = await db.fetch_account(account_id)
                acc = dict(row) if row else None
            if client is None or acc is None:
                raise RuntimeError("请先发送验证码")
            try:
                await client.sign_in(phone=acc["phone"], code=code)
            except SessionPasswordNeededError:
                await db.update_account(account_id, loginStatus="PASSWORD_NEEDED")
                return {"ok": True, "needPassword": True}
            await self._finalize_login(account_id, client, acc)
            return {"ok": True, "loggedIn": True}

    async def submit_password(self, account_id: str, password: str) -> dict:
        async with self._lock(account_id):
            client = self.clients.get(account_id)
            acc = self.accounts.get(account_id)
            if client is None or acc is None:
                raise RuntimeError("登录会话已失效，请重新发送验证码")
            await client.sign_in(password=password)
            await self._finalize_login(account_id, client, acc)
            return {"ok": True, "loggedIn": True}

    async def _finalize_login(self, account_id: str, client: TelegramClient, acc: dict) -> None:
        self.clients[account_id] = client
        self.accounts[account_id] = acc
        self._attach_handler(account_id, client)
        await db.update_account(
            account_id,
            loginStatus="LOGGED_IN",
            onlineStatus="ONLINE",
            sessionStatus="SAVED",
            sessionPath=_session_path(account_id) + ".session",
            lastConnectedAt=datetime.now(timezone.utc),
            lastError=None,
        )
        log.info("account %s logged in (%s)", account_id, acc.get("phone"))

    async def relogin(self, account_id: str) -> dict:
        acc = await db.fetch_account(account_id)
        if not acc:
            raise RuntimeError("账号不存在")
        path = _session_path(account_id)
        if os.path.exists(path + ".session"):
            await self._resume_account(acc)
            if account_id in self.clients:
                return {"ok": True, "loggedIn": True}
        return await self.send_code(account_id)

    async def logout(self, account_id: str) -> dict:
        async with self._lock(account_id):
            client = self.clients.pop(account_id, None)
            try:
                if client is not None:
                    await client.log_out()
            except Exception:  # noqa: BLE001
                pass
            # remove the on-disk session as well
            path = _session_path(account_id) + ".session"
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
            self.accounts.pop(account_id, None)
            self.listening.pop(account_id, None)
            await db.update_account(account_id, loginStatus="LOGGED_OUT", onlineStatus="OFFLINE", sessionStatus="NONE")
            return {"ok": True}

    async def stop_account(self, account_id: str) -> dict:
        client = self.clients.pop(account_id, None)
        if client is not None:
            await client.disconnect()
        await db.update_account(account_id, onlineStatus="OFFLINE")
        return {"ok": True}

    async def start_account(self, account_id: str) -> dict:
        acc = await db.fetch_account(account_id)
        if not acc:
            raise RuntimeError("账号不存在")
        await self._resume_account(acc)
        return {"ok": account_id in self.clients}

    def status(self, account_id: str | None = None) -> dict:
        def one(aid: str) -> dict:
            client = self.clients.get(aid)
            return {
                "accountId": aid,
                "connected": bool(client and client.is_connected()),
                "listeningChats": len(self.listening.get(aid, set())),
            }
        if account_id:
            return {"ok": True, **one(account_id)}
        return {"ok": True, "accounts": [one(a) for a in self.clients.keys()]}

    # ---------------- dialogs ----------------

    async def sync_dialogs(self, account_id: str) -> dict:
        client = self.clients.get(account_id)
        acc = self.accounts.get(account_id) or (await db.fetch_account(account_id))
        if client is None or acc is None:
            raise RuntimeError("账号未登录，无法读取群组")
        tenant_id = acc["tenantId"]
        count = 0
        async for dialog in client.iter_dialogs():
            if not (dialog.is_group or dialog.is_channel):
                continue
            ent = dialog.entity
            mega = bool(getattr(ent, "megagroup", False))
            if dialog.is_channel and not mega:
                gtype = "CHANNEL"
            elif mega:
                gtype = "SUPERGROUP"
            else:
                gtype = "GROUP"
            await db.upsert_group(
                tenant_id, account_id, str(dialog.id),
                getattr(dialog, "title", "") or "", getattr(ent, "username", None), gtype,
            )
            count += 1
        return {"ok": True, "count": count}

    # ---------------- listening / matching / push ----------------

    def _attach_handler(self, account_id: str, client: TelegramClient) -> None:
        @client.on(events.NewMessage(incoming=True))
        async def handler(event):  # noqa: ANN001
            try:
                await self._on_message(account_id, event)
            except Exception as e:  # noqa: BLE001
                log.warning("on_message error (%s): %s", account_id, e)

    def _match_rule(self, rule: dict, account_id: str, tenant_id: str, chat_id: str, text: str) -> tuple[bool, str | None]:
        scope = rule["scope"]
        if scope == "TENANT" and rule["tenantId"] != tenant_id:
            return False, None
        if scope == "ACCOUNT" and rule["accountId"] != account_id:
            return False, None
        if scope == "GROUP" and str(rule.get("chatId")) != chat_id:
            return False, None

        low = text.lower()
        matched_kw = None
        for kw in (rule.get("include") or []):
            if kw and kw.lower() in low:
                matched_kw = kw
                break
        if matched_kw is None and rule.get("regex"):
            try:
                if re.search(rule["regex"], text):
                    matched_kw = rule["regex"]
            except re.error:
                pass
        if matched_kw is None:
            return False, None
        for kw in (rule.get("exclude") or []):
            if kw and kw.lower() in low:
                return False, None
        return True, matched_kw

    async def _on_message(self, account_id: str, event) -> None:  # noqa: ANN001
        chat_id = str(event.chat_id)
        if chat_id not in self.listening.get(account_id, set()):
            return
        acc = self.accounts.get(account_id)
        if not acc:
            return
        tenant_id = acc["tenantId"]
        text = event.message.message or ""

        rule_id = None
        matched_kw = None
        for rule in self.rules:
            ok, kw = self._match_rule(rule, account_id, tenant_id, chat_id, text)
            if ok:
                rule_id = rule["id"]
                matched_kw = kw
                break
        if matched_kw is None:
            return

        await db.touch_group(account_id, chat_id)

        chat = await event.get_chat()
        sender = await event.get_sender()
        username = getattr(chat, "username", None)
        title = getattr(chat, "title", None) or ""
        mid = event.message.id
        if username:
            link = f"https://t.me/{username}/{mid}"
        elif chat_id.startswith("-100"):
            link = f"https://t.me/c/{chat_id[4:]}/{mid}"
        else:
            link = None

        sender_username = getattr(sender, "username", None)
        sender_name = " ".join(
            x for x in [getattr(sender, "first_name", None), getattr(sender, "last_name", None)] if x
        ) or getattr(sender, "title", "") or ""
        sender_id = str(event.sender_id) if event.sender_id else None

        await db.insert_hit(
            tenantId=tenant_id, ruleId=rule_id, accountId=account_id, sourceChatId=chat_id,
            sourceTitle=title, sourceUsername=username, senderId=sender_id, senderName=sender_name,
            senderUsername=sender_username, messageId=str(mid), content=text[:4000],
            messageLink=link, matchedKeyword=matched_kw,
        )

        meta = {
            "title": title, "sender_name": sender_name, "sender_username": sender_username,
            "matched_kw": matched_kw, "link": link, "chat_id": chat_id, "mid": mid,
        }
        client = self.clients.get(account_id)
        for target in self.targets_by_tenant.get(tenant_id, []):
            await self._push_to_target(client, account_id, tenant_id, event, target, meta)

    async def _push_to_target(self, client, account_id, tenant_id, event, target, meta) -> None:  # noqa: ANN001
        chat_id = meta["chat_id"]
        mid = str(meta["mid"])
        target_id = target["id"]
        mode = target.get("mode") or "PREFER_FORWARD"

        log_id = await db.claim_push(tenant_id, account_id, chat_id, mid, target_id, mode)
        if not log_id:
            return  # de-dup: already delivered to this target

        try:
            dest = self._resolve_target(target["chatId"])
        except Exception as e:  # noqa: BLE001
            await db.finish_push(log_id, "FORWARD", "FAILED", f"目标解析失败: {e}"[:480])
            return

        method = "FORWARD"
        try:
            if mode == "LINK_ONLY":
                method = "LINK"
                await client.send_message(dest, self._link_text(meta), link_preview=False)
            else:
                try:
                    await client.forward_messages(dest, event.message)
                    method = "FORWARD"
                except Exception as fe:  # noqa: BLE001
                    if mode == "FORWARD_ONLY":
                        raise fe
                    method = "LINK"
                    await client.send_message(dest, self._link_text(meta), link_preview=False)
            await db.finish_push(log_id, method, "SENT", None)
        except Exception as e:  # noqa: BLE001
            await db.finish_push(log_id, method, "FAILED", str(e)[:480])

    @staticmethod
    def _resolve_target(chat_id: str):
        s = (chat_id or "").strip()
        if s.startswith("@") or s.startswith("http"):
            return s
        try:
            return int(s)
        except ValueError:
            return s

    @staticmethod
    def _link_text(meta: dict) -> str:
        lines = ["\U0001F514 关键词命中"]
        lines.append(f"来源群：{meta['title']}")
        if meta.get("sender_name"):
            lines.append(f"发送人：{meta['sender_name']}")
        if meta.get("sender_username"):
            lines.append(f"用户名：@{meta['sender_username']}")
        lines.append("时间：" + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
        if meta.get("matched_kw"):
            lines.append(f"关键词：{meta['matched_kw']}")
        if meta.get("link"):
            lines.append(f"原消息链接：{meta['link']}")
        return "\n".join(lines)


manager = ListenerManager()
