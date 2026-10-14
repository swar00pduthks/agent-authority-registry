"""Guided-path deep agent.

Flow: one requirements form (7 questions, a single interrupt) -> recommended
builder path (no-code / low-code / pro-code) -> the path's skill is read and
its steps are published with write_todos -> the agent works through them and
pauses on every [You] step. Deliverables are saved under /outputs and published.
"""

import json
import mimetypes
import os
from pathlib import Path

from langchain.agents.middleware import TodoListMiddleware
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_core.tools import tool
from langchain.tools import ToolRuntime
from langgraph.types import interrupt

from registry_client import RegistryProfile, default_client

ROOT = Path(__file__).parent
# Deliverables live here and are served at /files by webapp.py.
OUTPUTS = ROOT / "outputs"
OUTPUTS.mkdir(exist_ok=True)

CLIENT = default_client()

# Questions, prompt sections, skills, tools and UI mapping all come from the registry profile
# this conversation pinned. Nothing about them is written in this file.
BASE_PROMPT = "You are the AI Platform Guide."

@tool
def collect_requirements(runtime: ToolRuntime, prefill: dict[str, str] | None = None) -> str:
    """Show the user the requirements form and return their answers as JSON.

    prefill optionally pre-selects answers, keyed by question id (only "goal"
    is expected, taken from the user's opening message).
    """
    questions = (runtime.state.get("registry") or {}).get("questions") or []
    if not questions:
        return "Error: this agent's profile defines no questions."
    raw = interrupt(
        {
            "kind": "form",
            "title": "Tell us what you need",
            "questions": questions,
            "prefill": prefill or {},
        }
    )
    try:
        given = json.loads(raw) if isinstance(raw, str) else dict(raw)
    except (TypeError, ValueError):
        return "Error: the form returned an unreadable answer. Call collect_requirements again."

    answers = [
        {"id": q["id"], "question": q["label"], "answer": str(given.get(q["id"], "")).strip()}
        for q in questions
    ]
    if any(not a["answer"] for a in answers):
        return "Error: some questions were not answered. Call collect_requirements again."
    return json.dumps({"answers": answers})


@tool
def ask_user(question: str, options: list[str]) -> str:
    """Ask the user ONE multiple-choice question and wait for the answer.

    Use it for every plan step the user must perform.
    """
    return str(interrupt({"question": question, "options": options}))


@tool
def recommend_path(path: str, reason: str, requirements: list[str], runtime: ToolRuntime) -> str:
    """Record the recommended builder path and the user's requirements.

    path: the exact name of one of your available path skills.
    """
    # Report the version this conversation pinned, not whatever the registry points at now.
    snap = runtime.state.get("registry") or {}
    skill = (snap.get("skills") or {}).get(path)
    if not skill:
        return f"Unknown path. Use exactly one of: {', '.join(sorted(snap.get('skills') or {}))}."
    info = {k: skill[k] for k in ("version", "status", "label", "blurb", "accent")} | {"id": path, "env": snap.get("env")}
    return json.dumps({"path": info, "reason": reason})


@tool
def publish_file(path: str) -> str:
    """Make a finished file available to the user in the Output section.

    path is a virtual path under /outputs/, for example /outputs/summary.md.
    """
    target = (ROOT / path.lstrip("/")).resolve()
    outputs = OUTPUTS.resolve()
    if outputs not in target.parents or not target.is_file():
        return "Error: only existing files under /outputs/ can be published."
    rel = target.relative_to(outputs).as_posix()
    return json.dumps(
        {
            "type": "file",
            "name": target.name,
            "mime": mimetypes.guess_type(target.name)[0] or "application/octet-stream",
            "size": target.stat().st_size,
            "url": f"/files/{rel}",
        }
    )


TOOLS = [collect_requirements, ask_user, recommend_path, publish_file]
BUILTIN_TOOLS = {t.name for t in TOOLS}

agent = create_deep_agent(
    model=os.getenv("MODEL", "anthropic:claude-sonnet-4-5"),
    tools=TOOLS,
    system_prompt=BASE_PROMPT,
        backend=FilesystemBackend(root_dir=str(ROOT), virtual_mode=True),
    # RegistryProfile fills in the skills list from the registry; this folder is where
    # a skill is unpacked, once verified, when the agent first reads it.
    # write_todos is not part of every deepagents version's default stack, so add it explicitly.
    middleware=[RegistryProfile(CLIENT, BUILTIN_TOOLS), TodoListMiddleware()],
    skills=["/skill_cache/"],
)
