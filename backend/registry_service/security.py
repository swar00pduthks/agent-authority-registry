"""Authentication, authorisation, signing and rate limiting.

Prototype choices, with what production would use:
  tokens         random bearer tokens, stored as SHA-256 hashes      -> OIDC / workload identity
  roles          reader, agent, publisher, approver, admin           -> same, from the IdP's groups
  signing key    Ed25519 key in a file                               -> KMS or HSM, with rotation
  rate limit     per token, in Redis when available                  -> an API gateway
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import time
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

PERMS = {
    "reader": {"read"},
    "agent": {"read", "usage"},
    "publisher": {"read", "publish"},
    "approver": {"read", "approve"},
    "admin": {"read", "usage", "publish", "approve", "admin"},
}
RATE_PER_MINUTE = int(os.getenv("REGISTRY_RATE_PER_MINUTE", "600"))
log = logging.getLogger("registry.security")


def new_token() -> str:
    return "rg_" + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def allowed(roles: str, perm: str) -> bool:
    return any(perm in PERMS.get(r, ()) for r in roles.split(","))


class Signer:
    """Signs `skill_id|version|sha256` when a version is approved."""

    def __init__(self, path: Path):
        if path.exists():
            self.key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        else:
            self.key = ed25519.Ed25519PrivateKey.generate()
            path.write_bytes(
                self.key.private_bytes(
                    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
                )
            )
            path.chmod(0o600)
        self.public_pem = self.key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode()
        self.key_id = hashlib.sha256(self.public_pem.encode()).hexdigest()[:12]

    @staticmethod
    def message(skill_id: str, version: str, digest: str) -> bytes:
        return f"{skill_id}|{version}|{digest}".encode()

    def sign(self, skill_id: str, version: str, digest: str) -> str:
        return base64.b64encode(self.key.sign(self.message(skill_id, version, digest))).decode()


def verify(public_pem: str, skill_id: str, version: str, digest: str, signature: str) -> bool:
    try:
        pub = serialization.load_pem_public_key(public_pem.encode())
        pub.verify(base64.b64decode(signature), Signer.message(skill_id, version, digest))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


class RateLimiter:
    def __init__(self, bus):
        self.bus = bus
        self.local: dict[tuple, int] = {}

    def hit(self, who: str) -> bool:
        minute = int(time.time() // 60)
        if self.bus.redis:
            key = f"rl:{who}:{minute}"
            try:
                n = self.bus.redis.incr(key)
                if n == 1:
                    self.bus.redis.expire(key, 90)
                return n <= RATE_PER_MINUTE
            except Exception as e:
                log.warning("Redis rate limiting unavailable (%s); using in-process limiter", e)
                self.bus.redis = None
        self.local = {k: v for k, v in self.local.items() if k[1] == minute}
        self.local[(who, minute)] = self.local.get((who, minute), 0) + 1
        return self.local[(who, minute)] <= RATE_PER_MINUTE
