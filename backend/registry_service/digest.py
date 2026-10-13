"""A digest over the tool definitions an MCP server offers.

The registry records it when a server is registered. The agent recomputes it from what the
server offers now and refuses to load the server if it differs, so a server cannot quietly
change a tool's description or schema after it was reviewed.
"""
import hashlib
import json


def tool_digest(tools: list[dict], allow: list[str]) -> str:
    chosen = sorted(
        ({"name": t["name"], "description": t.get("description") or "", "input_schema": t.get("input_schema") or {}} for t in tools if t["name"] in allow),
        key=lambda t: t["name"],
    )
    return hashlib.sha256(json.dumps(chosen, sort_keys=True).encode()).hexdigest()
