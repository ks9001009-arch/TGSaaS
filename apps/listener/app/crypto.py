import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import ENCRYPTION_KEY


def _key() -> bytes:
    return hashlib.sha256(ENCRYPTION_KEY.encode("utf-8")).digest()


def decrypt_secret(enc: str) -> str:
    """Decrypt a value produced by the NestJS crypto util.

    Wire format: v1:<base64(iv)>:<base64(ciphertext || authTag)>
    Non-encrypted/legacy values are returned unchanged.
    """
    if not enc:
        return ""
    parts = enc.split(":")
    if len(parts) != 3 or parts[0] != "v1":
        return enc
    iv = base64.b64decode(parts[1])
    blob = base64.b64decode(parts[2])
    return AESGCM(_key()).decrypt(iv, blob, None).decode("utf-8")
