"""Seeds the sample registry through the HTTP API, using two different people so the two-person rules hold."""
import json
import os
from pathlib import Path

from starlette.testclient import TestClient

from .app import DB_PATH, app
from .bootstrap import OUT

HERE = Path(__file__).resolve().parent
SKILLS = HERE.parent / "skills_src"
tokens = json.loads(OUT.read_text())
defaults = json.loads((HERE / "defaults.json").read_text())

c = TestClient(app, base_url="http://registry")
H = lambda who: {"authorization": f"Bearer {tokens[who]}"}


def call(who, method, url, **kw):
    r = c.request(method, url, headers=H(who), **kw)
    if r.status_code >= 300:
        raise SystemExit(f"{method} {url} as {who}: {r.status_code} {r.text}")
    return r.json() if r.content else None


skills = []
for d in sorted(SKILLS.iterdir()):
    m = json.loads((d / "skill.json").read_text())
    call("alice", "POST", "/v1/skills/compose", json={**m, "skill_md": (d / "SKILL.md").read_text()})
    call("bob", "PUT", f"/v1/skills/{m['id']}/{m['version']}/status", json={"status": "approved"})
    skills.append({"id": m["id"], "version": m["version"]})

BUILTIN = {
    "collect_requirements": "Show the requirements form and return the answers",
    "ask_user": "Ask the user to complete a step and wait for the reply",
    "recommend_path": "Record the recommended builder path",
    "publish_file": "Publish a finished file to the Output section",
}
tools = []
for tid, desc in BUILTIN.items():
    call("alice", "POST", "/v1/tools", json={"id": tid, "version": "1.0.0", "kind": "builtin", "description": desc})
    call("bob", "PUT", f"/v1/tools/{tid}/1.0.0/status", json={"status": "approved"})
    tools.append({"id": tid, "version": "1.0.0"})
# An MCP server. The digest pins the tool definitions as reviewed; `allow` excludes delete_standard.
import asyncio  # noqa: E402

from mcp import Client  # noqa: E402

from .digest import tool_digest  # noqa: E402

MCP_URL = "http://127.0.0.1:8810/mcp"
ALLOW = ["list_standards", "get_standard"]


async def offered():
    async with Client(MCP_URL) as m:
        return [{"name": t.name, "description": t.description or "", "input_schema": t.input_schema} for t in (await m.list_tools()).tools]


call("alice", "POST", "/v1/tools", json={
    "id": "platform_standards", "version": "1.0.0", "kind": "mcp",
    "description": "The platform's published standards (naming, data classification, release).",
    "spec": {"url": MCP_URL, "allow": ALLOW, "digest": tool_digest(asyncio.run(offered()), ALLOW)},
})
call("bob", "PUT", "/v1/tools/platform_standards/1.0.0/status", json={"status": "approved"})
tools.append({"id": "platform_standards", "version": "1.0.0"})

UI = {
    "collect_requirements": ("requirements-stepper", "One-form questionnaire with review"),
    "ask_user": ("ask-user-card", "Question card with answer buttons"),
    "write_todos": ("hidden", "Shown in the route panel instead of the chat"),
    "recommend_path": ("hidden", "Shown in the route panel instead of the chat"),
}
ui = []
for name, (component, desc) in UI.items():
    call("alice", "POST", "/v1/ui", json={"id": name, "version": "1.0.0", "component": component, "description": desc})
    call("bob", "PUT", f"/v1/ui/{name}/1.0.0/status", json={"status": "approved"})
    ui.append({"name": name, "version": "1.0.0"})

config = {
    "model": os.getenv("MODEL", "anthropic:claude-sonnet-4-5"),
    "prompt": {"sections": defaults["sections"]},
    "questions": defaults["questions"],
    "skills": skills, "tools": tools, "ui": ui,
}
rev = call("alice", "POST", "/v1/agents/platform-guide/revisions", json={"config": config, "note": "Initial profile"})["id"]
call("bob", "PUT", f"/v1/revisions/{rev}/status", json={"status": "approved"})
for env in ("dev", "uat", "prod"):
    call("bob", "PUT", f"/v1/agents/platform-guide/pins/{env}", json={"revision": rev})
print(f"seeded {DB_PATH.name}: revision #{rev} pinned in dev, uat and prod")
print("audit chain:", call("bob", "GET", "/v1/audit/verify"))
