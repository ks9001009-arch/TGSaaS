import asyncio
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError

from .config import SESSION_DIR
from .db import db

log = logging.getLogger("listener.manager")

# 称呼名后常见的分隔符 / 模板词，用于从消息开头提取“被称呼的用户”
_NAME_STOP_CHARS = "，,。.！!？?：:；;、（(《【[ "
_NAME_STOP_WORDS = ("你好", "您好", "親愛的", "亲爱的", "恭喜", "欢迎", "歡迎")
# “当天”按此时区偏移计算（默认 +8，可用环境变量覆盖）
_DEDUP_TZ_OFFSET_HOURS = int(os.environ.get("DEDUP_TZ_OFFSET_HOURS", "8"))


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
        # 监控机器人名单：tenant_id -> {"usernames": set[str], "userids": set[str]}
        self.bot_whitelist_by_tenant: dict[str, dict] = {}
        # 按用户当天全局去重（内存态，跨群生效）
        self._dedup_day: str | None = None
        self._user_seen: set[str] = set()
        # 最近入群缓存：chat_id -> [(monotonic, 昵称小写, user_id)]，用于反查真实 ID
        self._recent_joins: dict[str, list] = {}

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

        wl: dict[str, dict] = {}
        try:
            for r in await db.fetch_bot_whitelist():
                d = wl.setdefault(r["tenantId"], {"usernames": set(), "userids": set()})
                if r["username"]:
                    d["usernames"].add(str(r["username"]).lower())
                if r["userId"]:
                    d["userids"].add(str(r["userId"]))
        except Exception as e:  # noqa: BLE001
            log.warning("加载监控机器人名单失败（表可能尚未创建，稍后会自动重试）：%s", e)
        self.bot_whitelist_by_tenant = wl

        log.info(
            "reload: %d listening accounts, %d rules, %d tenants with targets, %d tenants with bot-whitelist",
            len(self.listening), len(self.rules), len(self.targets_by_tenant), len(self.bot_whitelist_by_tenant),
        )

    def _forward_allowed(self, tenant_id: str, sender) -> bool:  # noqa: ANN001
        """只转发机器人发的消息：发送人是 Bot，或在该租户的监控机器人名单内
        （@用户名 / 数字ID）。频道、匿名管理员、真人、广告号一律过滤。"""
        if sender is None:
            return False
        if bool(getattr(sender, "bot", False)):
            return True
        wl = self.bot_whitelist_by_tenant.get(tenant_id)
        if not wl:
            return False
        uname = (getattr(sender, "username", None) or "").lower()
        if uname and uname in wl["usernames"]:
            return True
        uid = str(getattr(sender, "id", "") or "")
        if uid and uid in wl["userids"]:
            return True
        return False

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

        @client.on(events.ChatAction)
        async def chat_action(event):  # noqa: ANN001
            try:
                await self._on_chat_action(account_id, event)
            except Exception as e:  # noqa: BLE001
                log.warning("chat_action error (%s): %s", account_id, e)

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

    def _today_key(self) -> str:
        return (datetime.now(timezone.utc) + timedelta(hours=_DEDUP_TZ_OFFSET_HOURS)).strftime("%Y-%m-%d")

    def _user_dedup_ok(self, tenant_id: str, target_id: str, user_key: str) -> bool:
        """同一用户当天（全局）只放行第一条。首次→True；已出现过→False（跳过推送）。"""
        day = self._today_key()
        if day != self._dedup_day:
            self._dedup_day = day
            self._user_seen = set()
        k = f"{tenant_id}|{target_id}|{day}|{user_key}"
        if k in self._user_seen:
            return False
        self._user_seen.add(k)
        return True

    def _id_from_entities(self, event) -> int | None:  # noqa: ANN001
        """从消息实体里直接拿真实 user_id（可点击提及 / tg://user?id 链接）。"""
        try:
            msg = event.message
            for ent in (msg.entities or []):
                if ent.__class__.__name__ == "MessageEntityMentionName" and getattr(ent, "user_id", None):
                    return int(ent.user_id)
                url = getattr(ent, "url", None)
                if url and "tg://user?id=" in url:
                    m = re.search(r"tg://user\?id=(\d+)", url)
                    if m:
                        return int(m.group(1))
        except Exception:  # noqa: BLE001
            pass
        return None

    def _extract_name(self, t: str) -> str | None:
        """从消息开头提取“被称呼的昵称”。提取不到返回 None。"""
        t = (t or "").strip()
        if not t:
            return None
        cut = len(t)
        for i, ch in enumerate(t):
            if ch in _NAME_STOP_CHARS or ch.isspace():
                cut = i
                break
        for w in _NAME_STOP_WORDS:
            idx = t.find(w)
            if 0 <= idx < cut:
                cut = idx
        name = t[:cut].strip()
        if not name or len(name) > 32:
            return None
        if name in ("恭喜", "欢迎", "歡迎", "你好", "您好", "親愛的", "亲爱的"):
            return None
        return name

    def _recent_join(self, chat_id: str, nick: str | None = None, window: int = 180) -> int | None:
        """反查最近入群用户的真实 ID：窗口内优先按昵称匹配，匹配不到则取最近一次入群。"""
        bucket = self._recent_joins.get(chat_id) or []
        now = time.monotonic()
        recent = [(ts, name, uid) for ts, name, uid in bucket if now - ts <= window]
        if not recent:
            return None
        nl = (nick or "").strip().lower()
        if nl:
            for ts, name, uid in reversed(recent):
                if name and (name == nl or nl in name or name in nl):
                    return uid
        return recent[-1][2]

    def _parse_card(self, text: str):
        """解析“发送人信息”卡片：返回 (username, nick)。
        用户名字段里的 @xxx / t.me/xxx 是全局唯一标识；昵称字段为兜底。"""
        t = text or ""
        username = None
        m = re.search(r"用户名[：:]\s*([^\n]+)", t)
        if m:
            um = re.search(r"(?:@|t\.me/)([A-Za-z0-9_]{4,32})", m.group(1))
            if um:
                username = um.group(1)
        nick = None
        m = re.search(r"昵称[：:]\s*([^\n]+)", t)
        if m:
            nv = m.group(1).strip()
            if nv and nv not in ("无", "无昵称", "无用户名"):
                nick = nv[:32]
        return username, nick

    def _resolve_dedup(self, event, text: str, chat_id: str):  # noqa: ANN001
        """返回 (dedup_key, is_fallback, nick)。
        ① 实体真实 ID（user_id / tg://user?id）；
        ② 结构化卡片“用户名”字段 → t.me/@用户名（全局唯一，最可靠）；
        ③ @开头的用户名；
        ④ 入群事件反查真实 ID（窗口内最近入群，适配无用户名的欢迎消息）；
        ⑤ 仅有昵称时按 群+昵称 兜底（转发后附原消息链接）；都拿不到则不做用户级去重。"""
        uid = self._id_from_entities(event)
        if uid is not None:
            return f"id:{uid}", False, None
        username, card_nick = self._parse_card(text or "")
        if username:
            return f"u:{username.lower()}", False, card_nick or username
        t = (text or "").strip()
        if t[:1] == "@":
            m = re.match(r"@([A-Za-z0-9_]{4,32})", t)
            if m:
                return f"u:{m.group(1).lower()}", False, None
        nick = card_nick
        uid = self._recent_join(chat_id, nick)
        if uid is not None:
            return f"id:{uid}", False, nick
        if nick:
            return f"g:{chat_id}|n:{nick.lower()}", True, nick
        return None, False, None

    async def _on_chat_action(self, account_id: str, event) -> None:  # noqa: ANN001
        """监听入群事件，缓存 (昵称 -> 真实 user_id)，供后续按昵称反查 ID。"""
        if not (getattr(event, "user_joined", False) or getattr(event, "user_added", False)):
            return
        chat_id = str(event.chat_id)
        if chat_id not in self.listening.get(account_id, set()):
            return
        try:
            users = await event.get_users()
        except Exception:  # noqa: BLE001
            users = []
        now = time.monotonic()
        bucket = self._recent_joins.setdefault(chat_id, [])
        if users:
            for u in users:
                name = " ".join(
                    x for x in [getattr(u, "first_name", None), getattr(u, "last_name", None)] if x
                ) or getattr(u, "title", "") or ""
                if getattr(u, "id", None):
                    bucket.append((now, name.strip().lower(), int(u.id)))
        elif getattr(event, "user_id", None):
            bucket.append((now, "", int(event.user_id)))
        cutoff = now - 600
        self._recent_joins[chat_id] = [r for r in bucket if r[0] >= cutoff][-200:]
        log.info("JOIN chat=%s recent=%s",
                 chat_id, [(n, u) for _, n, u in self._recent_joins[chat_id][-5:]])

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
        # 规则①：只转发机器人（或监控名单内发送人）的消息，过滤频道/真人/广告号
        if not self._forward_allowed(tenant_id, sender):
            return
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

        # 同一用户当天的验证/欢迎只推一次（此处消息均来自机器人/名单内发送人）
        dedup_key, is_fallback, nick = self._resolve_dedup(event, text, chat_id)
        try:
            _ents = [
                f"{e.__class__.__name__}:{getattr(e, 'user_id', None) or getattr(e, 'url', None) or ''}"
                for e in (event.message.entities or [])
            ]
        except Exception:  # noqa: BLE001
            _ents = []
        log.info("DEDUP key=%s fallback=%s nick=%s text=%r ents=%s",
                 dedup_key, is_fallback, nick, (text or "")[:180], _ents)

        await db.insert_hit(
            tenantId=tenant_id, ruleId=rule_id, accountId=account_id, sourceChatId=chat_id,
            sourceTitle=title, sourceUsername=username, senderId=sender_id, senderName=sender_name,
            senderUsername=sender_username, messageId=str(mid), content=text[:4000],
            messageLink=link, matchedKeyword=matched_kw,
        )

        meta = {
            "title": title, "sender_name": sender_name, "sender_username": sender_username,
            "matched_kw": matched_kw, "link": link, "chat_id": chat_id, "mid": mid, "nick": nick,
        }
        client = self.clients.get(account_id)
        for target in self.targets_by_tenant.get(tenant_id, []):
            await self._push_to_target(client, account_id, tenant_id, event, target, meta, dedup_key, is_fallback)

    async def _push_to_target(self, client, account_id, tenant_id, event, target, meta, dedup_key=None, is_fallback=False) -> None:  # noqa: ANN001
        chat_id = meta["chat_id"]
        mid = str(meta["mid"])
        target_id = target["id"]
        mode = target.get("mode") or "PREFER_FORWARD"

        # 同一用户当天已推送过 → 跳过（ID 优先；拿不到 ID 时按 群+昵称 去重）
        if dedup_key is not None and not self._user_dedup_ok(tenant_id, target_id, dedup_key):
            return

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
            if is_fallback and method == "FORWARD":
                try:
                    await client.send_message(dest, self._fallback_note(meta), link_preview=False)
                except Exception:  # noqa: BLE001
                    pass
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
        # 规则②：精简卡片，只保留 来源群 / 时间 / 关键词 / 原消息链接
        lines = ["\U0001F514 关键词命中"]
        lines.append(f"来源群：{meta['title']}")
        lines.append("时间：" + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
        if meta.get("matched_kw"):
            lines.append(f"关键词：{meta['matched_kw']}")
        if meta.get("link"):
            lines.append(f"原消息链接：{meta['link']}")
        return "\n".join(lines)

    @staticmethod
    def _fallback_note(meta: dict) -> str:
        nick = meta.get("nick")
        link = meta.get("link")
        lines = []
        if nick:
            lines.append(f"\U0001F464 昵称：{nick}（未取到用户 ID，已按群内昵称去重）")
        if link:
            lines.append(f"\U0001F517 原消息：{link}")
        elif meta.get("title"):
            lines.append(f"来源群：{meta['title']}")
        return "\n".join(lines) if lines else "（来源信息）"


manager = ListenerManager()
