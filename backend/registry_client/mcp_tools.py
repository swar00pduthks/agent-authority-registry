"""Tools from MCP servers named in the registry.

A registry entry of kind "mcp" holds a server URL, the tool names an agent may use, and a digest
of those tools' definitions as reviewed. When a conversation starts the agent connects, lists the
tools, drops any that are not allowed, refuses the server if its digest has changed, and keeps
names and descriptions. A tool's schema reaches the model only when it calls `load_tool`.

Safety rules the agent enforces itself, whatever the registry says:
  - the server must be on the agent's host allowlist (TOOL_HOST_ALLOWLIST)
  - credentials come from an environment variable NAMED by the entry, never stored in it
  - results are capped at 64 KB and wrapped as untrusted data, since a server can return instructions
"""
from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import Any
from urllib.parse import urlparse

import httpx2
from langchain_core.tools import StructuredTool
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from registry_service.digest import tool_digest

log = logging.getLogger("registry.mcp")
MAX_BYTES = 64 * 1024
TIMEOUT = 10.0
SEP = "__"


def host_allowlist() -> set[str]:
    return {h.strip() for h in os.getenv("TOOL_HOST_ALLOWLIST", "127.0.0.1:8810").split(",") if h.strip()}


def _client(spec: dict) -> Client:
    u = urlparse(spec["url"])
    if u.scheme not in ("http", "https") or u.netloc not in host_allowlist():
        raise PermissionError(f"this agent may not connect to {u.netloc or spec['url']}")
    headers = {}
    if spec.get("auth_env") and os.getenv(spec["auth_env"]):
        headers["authorization"] = f"Bearer {os.environ[spec['auth_env']]}"
    http = httpx2.AsyncClient(headers=headers, timeout=TIMEOUT, follow_redirects=False)
    return Client(streamable_http_client(spec["url"], http_client=http))


def run_sync(coro):
    """Run a coroutine from sync code, even when a loop is already running on this thread."""
    box: dict[str, Any] = {}

    def target():
        try:
            box["v"] = asyncio.run(coro)
        except BaseException as e:  # noqa: BLE001
            box["e"] = e

    t = threading.Thread(target=target)
    t.start()
    t.join()
    if "e" in box:
        raise box["e"]
    return box["v"]


async def discover(server_id: str, version: str, spec: dict) -> dict:
    """Connect once, apply the allowlist and check the digest. Returns the snapshot entry."""
    async with _client(spec) as c:
        offered = [
            {"name": t.name, "description": t.description or "", "input_schema": t.input_schema}
            for t in (await c.list_tools()).tools
        ]
    allow = spec.get("allow") or []
    tools = [t for t in offered if t["name"] in allow]
    if spec.get("digest") and tool_digest(offered, allow) != spec["digest"]:
        raise ValueError("the server's tool definitions no longer match the reviewed digest")
    return {
        "version": version,
        "spec": {k: spec[k] for k in ("url", "auth_env") if k in spec},
        "tools": {f"{server_id}{SEP}{t['name']}": {**t, "description": t["description"][:300]} for t in tools},
    }


def build_tool(server: dict, qualified: str) -> StructuredTool:
    tool = server["tools"][qualified]
    spec = server["spec"]

    async def call(**kwargs) -> str:
        try:
            async with _client(spec) as c:
                res = await c.call_tool(tool["name"], kwargs)
        except Exception as e:  # noqa: BLE001
            return f"Error: the tool call failed ({type(e).__name__})."
        text = "\n".join(getattr(p, "text", "") for p in res.content)[:MAX_BYTES]
        label = "error" if res.is_error else "ok"
        return f"<untrusted_tool_result tool={qualified} status={label}>\n{text}\n</untrusted_tool_result>"

    return StructuredTool(
        name=qualified,
        description=tool["description"],
        args_schema=tool["input_schema"],
        coroutine=call,
        func=lambda **kw: run_sync(call(**kw)),
    )
