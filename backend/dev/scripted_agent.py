"""Scripted stand-in for the LLM: the real graph, tools, skills and interrupts run, with no API key. One scripted run per conversation."""
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from agent import BASE_PROMPT, ROOT, TOOLS, BUILTIN_TOOLS, CLIENT
from registry_client import RegistryProfile
from langchain.agents.middleware import TodoListMiddleware
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
import json
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from pydantic import Field

class Scripted(BaseChatModel):
    script: list = Field(default_factory=list)
    pos: dict = Field(default_factory=dict)  # one position per conversation

    @property
    def _llm_type(self):
        return "scripted"

    def bind_tools(self, tools, **kw):
        return self

    def _next(self):
        from langgraph.config import get_config

        thread = get_config().get("configurable", {}).get("thread_id", "")
        i = self.pos.get(thread, 0)
        self.pos[thread] = i + 1
        m = self.script[i]
        # The script reads whichever version of the skill this conversation was given.
        for t in m.tool_calls:
            p = t["args"].get("file_path", "")
            if "@VERSION@" in p:
                v = {s["id"]: s["version"] for s in CLIENT.resolve()["skills"]}["low-code-path"]
                t["args"]["file_path"] = p.replace("@VERSION@", v)
        return m

    def _generate(self, messages, stop=None, run_manager=None, **kw):
        return ChatResult(generations=[ChatGeneration(message=self._next())])

    def _stream(self, messages, stop=None, run_manager=None, **kw):
        m = self._next()
        chunks = [{"name": t["name"], "args": json.dumps(t["args"]), "id": t["id"], "index": k} for k, t in enumerate(m.tool_calls)]
        yield ChatGenerationChunk(message=AIMessageChunk(content=m.content, tool_call_chunks=chunks))

n = 0
def call(name, args):
    global n
    n += 1
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"call_{n}", "type": "tool_call"}])

STEPS = [
    "[You] Describe the workflow trigger and the systems it must touch",
    "[Agent] Sketch the workflow canvas: trigger, agent node, tool nodes, approval node",
    "[You] Create the connections and store credentials in the platform vault",
    "[Agent] Generate the node configuration and the prompt for the agent node",
    "[You] Add a custom expression or small script node where the logic needs it",
    "[Agent] Create 5 test cases covering the happy path and two failure modes",
    "[You] Run the test cases on the canvas and review the traces",
    "[Agent] Summarise the results and list what to fix before release",
    "[You] Promote the workflow to production",
]
def todos(done, doing):
    return {"todos": [{"content": s, "status": "completed" if i < done else ("in_progress" if i == doing else "pending")} for i, s in enumerate(STEPS)]}

script = [
    call("collect_requirements", {"prefill": {"goal": "Automate a workflow"}}),
    call("recommend_path", {"path": "low-code-path", "reason": "You need standard app connections and light scripting, with your team as the audience.",
                            "requirements": ["Workflow automation", "Team of about 20", "Internal data", "Two standard apps", "Human approval"]}),
    call("read_file", {"file_path": "/skill_cache/low-code-path/@VERSION@/SKILL.md"}),
    call("write_todos", todos(0, 0)),
    call("load_tool", {"name": "platform_standards__get_standard"}),
    call("platform_standards__get_standard", {"standard_id": "data-classification"}),
    call("ask_user", {"question": "Describe the workflow trigger and the systems it must touch, then tell me when you're done.", "options": ["Done", "I need help"]}),
    call("write_todos", todos(1, 1)),
    call("write_file", {"file_path": "/outputs/workflow-canvas.md", "content": "# Workflow canvas\n\n1. Trigger: new ticket\n2. Agent node: classify and draft a reply\n3. Tool nodes: CRM lookup, ticket update\n4. Approval node: a person approves before sending\n"}),
    call("publish_file", {"path": "/outputs/workflow-canvas.md"}),
    call("write_todos", todos(2, 2)),
    AIMessage(content="I sketched the canvas: a ticket trigger, an agent node, two tool nodes and an approval node. Next I need you to create the connections."),
]

model = Scripted(script=script)
graph = create_deep_agent(
    model=model, tools=TOOLS, system_prompt=BASE_PROMPT,
    backend=FilesystemBackend(root_dir=str(ROOT), virtual_mode=True), # write_todos is not part of every deepagents version's default stack, so add it explicitly.
    middleware=[RegistryProfile(CLIENT, BUILTIN_TOOLS), TodoListMiddleware()], skills=["/skill_cache/"],
)
