import os
import sys

DATABASE_URL = os.environ.get("DATABASE_URL", "")
LISTENER_PORT = int(os.environ.get("LISTENER_PORT", "8100"))

# Must match the NestJS API (apps/api/src/common/crypto.util.ts) so the API Hash
# encrypted by the API can be decrypted here.
_WEAK_KEYS = {
    "",
    "change_me",
    "change_me_encryption_key",
    "change_me_encryption_key_use_long_random_string",
    "tg_saas_default_encryption_key_change_me",
}

_WEAK_TOKENS = {
    "",
    "change_me",
    "change_me_listener_token",
    "listener",
    "secret",
}

_is_prod = os.environ.get("NODE_ENV", "").lower() == "production"

_raw_token = (os.environ.get("LISTENER_TOKEN") or "").strip()
if not _raw_token or _raw_token in _WEAK_TOKENS or "change_me" in _raw_token.lower():
    if _is_prod:
        print(
            "LISTENER_TOKEN is missing or weak. Set a strong LISTENER_TOKEN before starting in production.",
            file=sys.stderr,
        )
        sys.exit(1)
    LISTENER_TOKEN = "local_dev_only_listener_token_insecure"
elif _is_prod and len(_raw_token) < 24:
    print("LISTENER_TOKEN must be at least 24 characters in production.", file=sys.stderr)
    sys.exit(1)
else:
    LISTENER_TOKEN = _raw_token

_raw_key = (os.environ.get("ENCRYPTION_KEY") or "").strip()

if not _raw_key or _raw_key in _WEAK_KEYS or "change_me" in _raw_key.lower():
    if _is_prod:
        print(
            "ENCRYPTION_KEY is missing or weak. Set a strong ENCRYPTION_KEY before starting in production.",
            file=sys.stderr,
        )
        sys.exit(1)
    ENCRYPTION_KEY = "local_dev_only_encryption_key_insecure"
elif _is_prod and len(_raw_key) < 24:
    print("ENCRYPTION_KEY must be at least 24 characters in production.", file=sys.stderr)
    sys.exit(1)
else:
    ENCRYPTION_KEY = _raw_key

# Telethon session files live here (mount a volume so they survive restarts).
SESSION_DIR = os.environ.get("SESSION_DIR", "/sessions")
