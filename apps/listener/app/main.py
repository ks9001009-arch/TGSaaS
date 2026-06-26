import logging

from fastapi import Body, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .config import LISTENER_TOKEN
from .db import db
from .manager import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("listener")

app = FastAPI(title="Telegram Listener Service")


def _auth(token: str | None) -> None:
    if LISTENER_TOKEN and token != LISTENER_TOKEN:
        raise HTTPException(status_code=401, detail="invalid listener token")


async def _guard(call, x_listener_token):
    _auth(x_listener_token)
    try:
        return await call()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning("control error: %s", e)
        return JSONResponse(status_code=200, content={"ok": False, "error": str(e)})


@app.on_event("startup")
async def _startup():
    try:
        await manager.start()
        log.info("listener started")
    except Exception as e:  # noqa: BLE001
        log.error("startup error: %s", e)


@app.on_event("shutdown")
async def _shutdown():
    await db.close()


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/reload")
async def reload(x_listener_token: str | None = Header(default=None)):
    async def run():
        await manager.load_api()
        await manager.reload()
        return {"ok": True}
    return await _guard(run, x_listener_token)


@app.post("/login/send-code")
async def send_code(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.send_code(body["accountId"]), x_listener_token)


@app.post("/login/confirm")
async def confirm(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.confirm_code(body["accountId"], body["code"]), x_listener_token)


@app.post("/login/password")
async def password(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.submit_password(body["accountId"], body["password"]), x_listener_token)


@app.post("/accounts/relogin")
async def relogin(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.relogin(body["accountId"]), x_listener_token)


@app.post("/accounts/logout")
async def logout(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.logout(body["accountId"]), x_listener_token)


@app.post("/accounts/start")
async def start_account(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.start_account(body["accountId"]), x_listener_token)


@app.post("/accounts/stop")
async def stop_account(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.stop_account(body["accountId"]), x_listener_token)


@app.post("/accounts/sync-dialogs")
async def sync_dialogs(body: dict = Body(...), x_listener_token: str | None = Header(default=None)):
    return await _guard(lambda: manager.sync_dialogs(body["accountId"]), x_listener_token)


@app.post("/status")
async def status(body: dict = Body(default={}), x_listener_token: str | None = Header(default=None)):
    _auth(x_listener_token)
    return manager.status(body.get("accountId"))
