"""Extra HTTP routes mounted next to LangGraph's own API (see "http" in langgraph.json).

/files         published deliverables, so the UI can open and download them
               (in production, signed URLs from your object store)
/agent-config  what the browser needs from the registry: which component renders which tool.
               The browser never holds a registry token; this server fetches it on its behalf.
"""

from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from registry_client import default_client

OUTPUTS = Path(__file__).parent / "outputs"
OUTPUTS.mkdir(exist_ok=True)
client = default_client()


async def agent_config(request):
    try:
        res = client.resolve()
    except Exception as e:  # the UI falls back to its built-in defaults
        return JSONResponse({"error": str(e)}, status_code=503)
    return JSONResponse(
        {
            "env": res["env"],
            "revision": res["revision"],
            "ui": {u["id"]: {"component": u["component"], "version": u["version"]} for u in res["ui"]},
        }
    )


app = Starlette(routes=[Route("/agent-config", agent_config), Mount("/files", app=StaticFiles(directory=OUTPUTS))])
