import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
LISTENER_PORT = int(os.environ.get("LISTENER_PORT", "8100"))
LISTENER_TOKEN = os.environ.get("LISTENER_TOKEN", "")

# Must match the NestJS API (apps/api/src/common/crypto.util.ts) so the API Hash
# encrypted by the API can be decrypted here.
ENCRYPTION_KEY = (
    os.environ.get("ENCRYPTION_KEY")
    or os.environ.get("JWT_SECRET")
    or "tg_saas_default_encryption_key_change_me"
)

# Telethon session files live here (mount a volume so they survive restarts).
SESSION_DIR = os.environ.get("SESSION_DIR", "/sessions")
