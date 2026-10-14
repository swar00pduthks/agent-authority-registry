import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import quote

_key = os.getenv("OUTPUT_FILE_SIGNING_KEY")
_SECRET = _key.encode() if _key else secrets.token_bytes(32)
_LIFETIME = 7 * 24 * 60 * 60


def signed_file_url(path: str) -> str:
    expires = int(time.time()) + _LIFETIME
    signature = hmac.new(_SECRET, f"{path}|{expires}".encode(), hashlib.sha256).hexdigest()
    return f"/files/{quote(path, safe='/')}?expires={expires}&signature={signature}"


def verify_file_url(path: str, signature: str, expires: str) -> bool:
    try:
        expiry = int(expires)
    except ValueError:
        return False
    if expiry <= time.time() or expiry > time.time() + _LIFETIME:
        return False
    expected = hmac.new(_SECRET, f"{path}|{expiry}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
