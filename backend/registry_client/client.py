"""Registry client for the agent.

- resolve() is cheap: it revalidates with If-None-Match, and a Redis event marks the
  cached copy stale the moment anything changes, so new conversations see a new pin at once.
- If the registry is down, the last good resolved profile is used (and said so in the logs).
- A skill's wheel is fetched only when the agent first reads it, verified against the
  registry's checksum and its Ed25519 signature, then cached by checksum.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import zipfile
import io
from pathlib import Path

import httpx

from registry_service.security import verify  # same code the service signs with; no service state is imported

log = logging.getLogger("registry.client")
BACKEND = Path(__file__).resolve().parent.parent
CHANNEL = "registry.events"


class RegistryError(RuntimeError):
    pass


class RegistryClient:
    def __init__(self, url: str, token: str, agent: str, env: str, pubkey: str | None, cache: Path, redis_url: str | None = None):
        self.url, self.agent, self.env, self.pubkey = url.rstrip("/"), agent, env, pubkey
        self.cache = cache
        self.http = httpx.Client(base_url=self.url, headers={"authorization": f"Bearer {token}"}, timeout=5.0)
        self._resolved: dict | None = None
        self._checked = 0.0
        self._stale = True
        self._lock = threading.Lock()
        self.redis_mode = False
        if redis_url:
            threading.Thread(target=self._listen, args=(redis_url,), daemon=True).start()

    # ---- change events ------------------------------------------------------
    def _listen(self, redis_url: str) -> None:
        try:
            import redis

            sub = redis.Redis.from_url(redis_url).pubsub()
            sub.subscribe(CHANNEL)
            self.redis_mode = True
            for msg in sub.listen():
                if msg["type"] == "message":
                    self._stale = True
        except Exception as e:
            self.redis_mode = False
            log.warning("registry events unavailable (%s); polling instead", e)

    # ---- resolving ----------------------------------------------------------
    def resolve(self) -> dict:
        """The profile this environment currently serves, for a NEW conversation."""
        with self._lock:
            fresh = self._resolved is not None and not self._stale and (self.redis_mode or time.time() - self._checked < 5)
            if fresh:
                return self._resolved  # type: ignore[return-value]
            try:
                headers = {"if-none-match": self._resolved["etag"]} if self._resolved else {}
                r = self.http.get(f"/v1/agents/{self.agent}/resolve", params={"env": self.env}, headers=headers)
                if r.status_code == 304 and self._resolved:
                    pass
                elif r.status_code == 200:
                    self._resolved = r.json()
                    self.cache.mkdir(parents=True, exist_ok=True)
                    (self.cache / "last_good.json").write_text(json.dumps(self._resolved))
                else:
                    raise RegistryError(f"registry answered {r.status_code}: {r.text[:200]}")
            except (httpx.HTTPError, RegistryError) as e:
                if self._resolved is None:
                    good = self.cache / "last_good.json"
                    if not good.exists():
                        raise RegistryError(f"registry unreachable and no last-good profile cached: {e}") from e
                    self._resolved = json.loads(good.read_text())
                log.warning("using the last good profile (revision %s): %s", self._resolved.get("revision"), e)
            self._checked, self._stale = time.time(), False
            return self._resolved  # type: ignore[return-value]

    def statuses(self, items: list[dict]) -> dict[tuple, str]:
        """Current status of specific versions, so a running conversation notices a revocation."""
        if not items:
            return {}
        try:
            r = self.http.post("/v1/status", json={"items": items})
            r.raise_for_status()
            return {(x["kind"], x["id"], x["version"]): x["status"] for x in r.json()}
        except httpx.HTTPError:
            return {}  # registry down: keep running on what the conversation pinned

    def report_usage(self, thread_id: str, revision: int, snapshot: dict) -> None:
        try:
            self.http.post("/v1/usage", json={"thread_id": thread_id, "agent": self.agent, "env": self.env, "revision": revision, "snapshot": snapshot})
        except httpx.HTTPError:
            pass

    # ---- skills -------------------------------------------------------------
    def ensure_skill(self, skill_id: str, version: str, sha256: str, signature: str | None) -> Path:
        """Fetch, verify and unpack one skill version. Returns the directory holding SKILL.md."""
        target = self.cache / "skills" / sha256
        if (target / "SKILL.md").is_file():
            return target
        if self.env != "dev" and not signature:
            raise RegistryError(f"{skill_id} {version} is unsigned and {self.env} only runs signed skills")
        r = self.http.get(f"/v1/skills/{skill_id}/{version}/wheel")
        if r.status_code != 200:
            raise RegistryError(f"{skill_id} {version}: registry answered {r.status_code}")
        if hashlib.sha256(r.content).hexdigest() != sha256:
            raise RegistryError(f"{skill_id} {version}: wheel does not match its checksum")
        if signature:
            if not self.pubkey:
                raise RegistryError("a signed skill arrived but no registry public key is pinned (REGISTRY_PUBKEY_FILE)")
            if not verify(self.pubkey, skill_id, version, sha256, signature):
                raise RegistryError(f"{skill_id} {version}: signature check failed")
        tmp = target.with_name(target.name + ".part")
        tmp.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            for info in z.infolist():
                parts = info.filename.split("/")
                if len(parts) == 2 and not parts[0].endswith(".dist-info") and parts[1] in ("SKILL.md", "skill.json") and info.file_size < 262_144:
                    (tmp / parts[1]).write_bytes(z.read(info))
        tmp.rename(target)
        return target


def default_client() -> RegistryClient:
    key_file = os.getenv("REGISTRY_PUBKEY_FILE")
    return RegistryClient(
        url=os.getenv("REGISTRY_URL", "http://127.0.0.1:8800"),
        token=os.getenv("REGISTRY_TOKEN", ""),
        agent=os.getenv("AGENT_ID", "platform-guide"),
        env=os.getenv("SKILL_ENV", "dev"),
        pubkey=Path(key_file).read_text() if key_file and Path(key_file).exists() else None,
        cache=BACKEND / "registry_cache",
        redis_url=os.getenv("REDIS_URL"),
    )
