"""Change events and the resolve cache. Redis when available, in-process otherwise."""
from __future__ import annotations

import json
import logging
import os
import threading

log = logging.getLogger("registry.bus")
CHANNEL = "registry.events"


class Bus:
    def __init__(self, url: str | None = None):
        self.url = url if url is not None else os.getenv("REDIS_URL")
        self.redis = None
        self._local: dict[str, str] = {}
        self._lock = threading.Lock()
        if self.url:
            try:
                import redis

                self.redis = redis.Redis.from_url(self.url, decode_responses=True)
                self.redis.ping()
            except Exception as e:  # the service must keep working without Redis
                log.warning("Redis unavailable (%s); using in-process cache", e)
                self.redis = None

    @property
    def mode(self) -> str:
        return "redis" if self.redis else "local"

    # resolve cache -------------------------------------------------------
    def get(self, key: str) -> str | None:
        if self.redis:
            return self.redis.get(f"resolved:{key}")
        with self._lock:
            return self._local.get(key)

    def put(self, key: str, value: str) -> None:
        if self.redis:
            self.redis.set(f"resolved:{key}", value, ex=300)
        else:
            with self._lock:
                self._local[key] = value

    def invalidate(self) -> None:
        """Any change can alter any agent's resolved config, so drop them all."""
        if self.redis:
            for k in self.redis.scan_iter("resolved:*"):
                self.redis.delete(k)
        else:
            with self._lock:
                self._local.clear()

    # events --------------------------------------------------------------
    def publish(self, event: dict) -> None:
        self.invalidate()
        if self.redis:
            self.redis.publish(CHANNEL, json.dumps(event))
