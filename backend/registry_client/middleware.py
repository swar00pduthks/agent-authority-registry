"""Pins the registry's configuration to each conversation and applies it.

Per conversation, once (and again only if something it pinned is revoked):
  - skills        names, descriptions and versions go in the agent's skills list; a skill's
                  body is fetched, verified and unpacked only when the agent reads it
  - prompt        the profile's prompt sections are appended to the system prompt
  - questions     the form's questions are read from the pinned profile by the tool
  - tools         built-in tools are enabled or hidden by the profile; registry-defined http
                  tools are listed by name and described, and their schema is loaded only when
                  the agent calls `load_tool`
"""
from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path
from typing import Any

from deepagents.middleware._utils import append_to_system_message
from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage
from langchain.tools import ToolRuntime, tool
from langgraph.config import get_config
from langgraph.types import Command
from typing_extensions import NotRequired

from .client import RegistryClient, RegistryError
from .mcp_tools import build_tool, discover, run_sync

log = logging.getLogger("registry.middleware")
SKILL_ROOT = "/skill_cache"
BACKEND = Path(__file__).resolve().parent.parent


class ProfileState(AgentState):
    registry: NotRequired[dict]
    loaded_tools: NotRequired[list[str]]


def _mcp_index(snap: dict) -> dict[str, str]:
    """qualified tool name -> server id, over every MCP server this conversation pinned."""
    return {q: sid for sid, srv in (snap.get("mcp") or {}).items() for q in srv["tools"]}


@tool
def load_tool(name: str, runtime: ToolRuntime) -> Command:
    """Load an extra tool listed under "Registry tools" so you can call it on your next step."""
    snap = runtime.state.get("registry") or {}
    index = _mcp_index(snap)
    call_id = runtime.tool_call_id
    if name not in index:
        return Command(update={"messages": [ToolMessage(f"No such tool. Available: {', '.join(sorted(index)) or 'none'}.", tool_call_id=call_id, status="error")]})
    loaded = list(runtime.state.get("loaded_tools") or [])
    if name not in loaded:
        loaded.append(name)
    return Command(update={"loaded_tools": loaded, "messages": [ToolMessage(f"Loaded {name}. You can call it now.", tool_call_id=call_id)]})


class RegistryProfile(AgentMiddleware):
    state_schema = ProfileState
    tools = [load_tool]

    def __init__(self, client: RegistryClient, builtin_tools: set[str]):
        super().__init__()
        self.client = client
        self.builtin = builtin_tools

    # ---- pin once per conversation -------------------------------------------
    def _snapshot(self, res: dict) -> dict:
        text = "\n\n".join(f"## {s['title']}\n{s['text']}" if s["id"] != "role" else s["text"] for s in (res["config"].get("prompt") or {}).get("sections", []))
        return {
            "revision": res["revision"], "env": res["env"], "etag": res["etag"], "prompt": text,
            "questions": res["config"].get("questions") or [],
            "skills": {s["id"]: s for s in res["skills"]},
            "tools": {t["id"]: t for t in res["tools"]},
            "ui": {u["id"]: u for u in res["ui"]},
            "mcp": {}, "mcp_errors": [],
        }

    async def _discover(self, snap: dict) -> None:
        for t in snap["tools"].values():
            if t["kind"] != "mcp":
                continue
            try:
                snap["mcp"][t["id"]] = await discover(t["id"], t["version"], t["spec"])
            except Exception as e:  # a bad server must not take the conversation down
                snap["mcp_errors"].append(f"{t['id']}: {e}")
                log.warning("MCP server %s skipped: %s", t["id"], e)

    def _revoked(self, snap: dict) -> bool:
        items = [{"kind": k, "id": i, "version": v["version"]} for k in ("skills", "tools", "ui") for i, v in snap[k].items()]
        return any(s in ("revoked", "missing") for s in self.client.statuses(items).values())

    def _load(self, state: dict) -> dict[str, Any] | None:
        snap = state.get("registry")
        if snap and not self._revoked(snap):
            return None
        snap = self._snapshot(self.client.resolve())
        run_sync(self._discover(snap))
        skills = [
            {
                "name": s["id"], "description": s["description"],
                "path": f"{SKILL_ROOT}/{s['id']}/{s['version']}/SKILL.md",
                "license": None, "compatibility": None,
                "metadata": {"version": s["version"], "status": s["status"], "env": snap["env"]},
                "allowed_tools": [],
            }
            for s in snap["skills"].values()
        ]
        try:
            self.client.report_usage(get_config()["configurable"].get("thread_id", "unknown"), snap["revision"], {
                "skills": {k: v["version"] for k, v in snap["skills"].items()},
                "tools": {k: v["version"] for k, v in snap["tools"].items()},
                "ui": {k: v["version"] for k, v in snap["ui"].items()},
            })
        except Exception:  # usage reporting is best effort
            pass
        return {"registry": snap, "loaded_tools": [], "skills_metadata": skills, "skills_load_errors": []}

    def before_agent(self, state, runtime):  # type: ignore[override]
        return self._load(state)

    async def abefore_agent(self, state, runtime):  # type: ignore[override]
        return await asyncio.to_thread(self._load, state)

    # ---- apply to the model call ----------------------------------------------
    def wrap_model_call(self, request, handler):
        return handler(self._apply(request))

    async def awrap_model_call(self, request, handler):
        return await handler(self._apply(request))

    def _apply(self, request):
        snap = request.state.get("registry")
        if not snap:
            return request
        loaded = set(request.state.get("loaded_tools") or [])
        listed = {q: t for srv in (snap.get("mcp") or {}).values() for q, t in srv["tools"].items()}
        extra = "\n".join(f"- {q}: {t['description']}" for q, t in listed.items() if q not in loaded)
        text = snap["prompt"] + (f"\n\n## Registry tools\nThese tools exist but are not loaded. Call `load_tool(name)` before using one.\n{extra}" if extra else "")
        tools = [t for t in request.tools if getattr(t, "name", None) not in self.builtin or t.name in snap["tools"]]
        index = _mcp_index(snap)
        tools += [build_tool(snap["mcp"][index[k]], k) for k in loaded if k in index]
        return request.override(system_message=append_to_system_message(request.system_message, text), tools=tools)

    # ---- apply to tool calls --------------------------------------------------
    def _error(self, request, message: str) -> ToolMessage:
        return ToolMessage(message, tool_call_id=request.tool_call["id"], name=request.tool_call["name"], status="error")

    def _guard(self, request):
        """Returns (error message | None, request to run)."""
        snap = request.state.get("registry") or {}
        name, args = request.tool_call["name"], request.tool_call.get("args") or {}
        path = str(args.get("file_path") or args.get("path") or "")
        if name == "read_file" and path.startswith(f"{SKILL_ROOT}/"):
            parts = path.split("/")
            skill = (snap.get("skills") or {}).get(parts[2] if len(parts) > 3 else "")
            if not skill or skill["version"] != parts[3]:
                return "That skill version is not part of this conversation.", request
            try:
                src = self.client.ensure_skill(skill["id"], skill["version"], skill["sha256"], skill.get("signature"))
                dest = BACKEND / "skill_cache" / skill["id"] / skill["version"]
                if not (dest / "SKILL.md").is_file():  # the agent's file tools read from here
                    shutil.copytree(src, dest, dirs_exist_ok=True)
            except RegistryError as e:
                return f"Could not load the skill: {e}", request
            return None, request
        index = _mcp_index(snap)
        if request.tool is None and name in (request.state.get("loaded_tools") or []) and name in index:
            return None, request.override(tool=build_tool(snap["mcp"][index[name]], name))
        if request.tool is not None and name in self.builtin and name not in (snap.get("tools") or {}):
            return f"The tool {name} is not enabled for this agent.", request
        return None, request

    def wrap_tool_call(self, request, handler):
        error, req = self._guard(request)
        return self._error(request, error) if error else handler(req)

    async def awrap_tool_call(self, request, handler):
        error, req = await asyncio.to_thread(self._guard, request)
        return self._error(request, error) if error else await handler(req)
