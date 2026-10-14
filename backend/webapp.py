"""Extra HTTP routes mounted next to LangGraph's own API (see "http" in langgraph.json).

/files         published deliverables, so the UI can open and download them
               (in production, signed URLs from your object store)
/agent-config  what the browser needs from the registry: which component renders which tool.
               The browser never holds a registry token; this server fetches it on its behalf.
"""

from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route

from file_access import verify_file_url
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


async def output_file(request):
    path = request.path_params["path"]
    target = (OUTPUTS / path).resolve()
    if (
        not verify_file_url(
            path, request.query_params.get("signature", ""), request.query_params.get("expires", "")
        )
        or OUTPUTS.resolve() not in target.parents
        or not target.is_file()
    ):
        return Response(status_code=404)
    return FileResponse(target)


app = Starlette(
    routes=[
        Route("/agent-config", agent_config),
        Route("/files/{path:path}", output_file, methods=["GET", "HEAD"]),
    ]
)
