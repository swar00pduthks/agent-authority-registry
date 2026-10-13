"""Registry HTTP API. Run: uvicorn registry_service.app:app --port 8800"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from functools import wraps
from urllib.parse import urlparse

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from .bus import Bus
from .db import DB, now
from .security import RateLimiter, Signer, allowed, hash_token, new_token
from .policy import ENVIRONMENTS, PINNABLE, SERVED, STATUSES
from .wheels import build_wheel, read_wheel, sha256

DB_PATH = Path(os.getenv("REGISTRY_DB", Path(__file__).resolve().parent.parent / "registry.db"))
db = DB(DB_PATH)
bus = Bus()
signer = Signer(Path(os.getenv("REGISTRY_SIGNING_KEY", DB_PATH.with_suffix(".signing.key"))))
limiter = RateLimiter(bus)
# Hosts an MCP server entry may point at. Enforced here when it is registered and again by the agent when it connects.
TOOL_HOSTS = {h.strip() for h in os.getenv("TOOL_HOST_ALLOWLIST", "127.0.0.1:8810").split(",") if h.strip()}


class Auth(BaseHTTPMiddleware):
    """Every route except /v1/health needs a bearer token; each token has roles and a request budget."""

    async def dispatch(self, request, call_next):
        if request.url.path == "/v1/health":
            return await call_next(request)
        header = request.headers.get("authorization", "")
        row = db.one("SELECT * FROM tokens WHERE token_hash=? AND revoked=0", (hash_token(header[7:]),)) if header.startswith("Bearer ") else None
        if not row:
            return JSONResponse({"error": "missing or invalid token"}, status_code=401)
        if not limiter.hit(row["name"]):
            return JSONResponse({"error": "rate limit exceeded"}, status_code=429, headers={"retry-after": "30"})
        request.state.principal = {"name": row["name"], "roles": row["roles"]}
        return await call_next(request)


def needs(perm: str):
    """Route guard: the caller's roles must grant `perm`."""

    def deco(fn):
        @wraps(fn)
        async def inner(r: Request):
            p = r.state.principal
            if not allowed(p["roles"], perm):
                db.audit(p["name"], "denied", r.url.path, {"needs": perm})
                return JSONResponse({"error": f"your roles ({p['roles']}) do not allow '{perm}'"}, status_code=403)
            return await fn(r)

        return inner

    return deco

KINDS = {  # url segment -> (table, id column)
    "skills": ("skill_versions", "skill_id"),
    "tools": ("tool_versions", "tool_id"),
    "ui": ("ui_versions", "name"),
}


def actor(r: Request) -> str:
    return r.state.principal["name"]


def err(message: str, status: int = 400, **extra) -> JSONResponse:
    return JSONResponse({"error": message, **extra}, status_code=status)


def changed(event: str, **info) -> None:
    bus.publish({"type": event, **info})


# ───────────── catalogue ─────────────

SKILL_COLS = "skill_id AS id, version, status, label, blurb, accent, description, sha256, signature, published_at, published_by, approved_by"


@needs("read")
async def list_items(r: Request):
    if r.path_params["kind"] not in KINDS:
        return err("not found", 404)
    table, idcol = KINDS[r.path_params["kind"]]
    if table == "skill_versions":
        rows = db.q(f"SELECT {SKILL_COLS} FROM skill_versions ORDER BY skill_id, published_at DESC")
    elif table == "tool_versions":
        rows = db.q("SELECT tool_id AS id, version, status, kind, description, spec, published_at, published_by FROM tool_versions ORDER BY tool_id, published_at DESC")
        for x in rows:
            x["spec"] = json.loads(x["spec"] or "{}")
    else:
        rows = db.q("SELECT name AS id, version, status, component, description, published_at, published_by FROM ui_versions ORDER BY name, published_at DESC")
    return JSONResponse(rows)


@needs("publish")
async def publish_skill_wheel(r: Request):
    form = await r.form()
    data = await form["file"].read()
    return _store_skill(r, data, str(form.get("status", "draft")))


@needs("publish")
async def compose_skill(r: Request):
    """Admin UI path: fields in, wheel built here."""
    b = await r.json()
    try:
        wheel = build_wheel(b["skill_md"], {k: b[k] for k in ("id", "version", "label", "blurb", "accent")} | {"kind": "path"})
    except KeyError as e:
        return err(f"missing field {e}")
    return _store_skill(r, wheel, b.get("status", "draft"))


def _store_skill(r: Request, data: bytes, status: str):
    if status != "draft":
        return err("a new version is always published as draft; an approver approves it")
    try:
        body, m = read_wheel(data)
    except Exception as e:
        return err(f"invalid skill wheel: {e}", 422)
    if db.one("SELECT 1 FROM skill_versions WHERE skill_id=? AND version=?", (m["id"], m["version"])):
        return err(f"{m['id']} {m['version']} is already published; versions are immutable", 409)
    db.run(
        "INSERT INTO skill_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
        (m["id"], m["version"], status, m["label"], m["blurb"], m["accent"], m["description"], body, data, sha256(data), now(), actor(r)),
    )
    db.audit(actor(r), "publish", f"skill:{m['id']}@{m['version']}", {"status": status})
    changed("skill", id=m["id"], version=m["version"])
    return JSONResponse({"id": m["id"], "version": m["version"], "status": status}, status_code=201)


@needs("read")
async def skill_wheel(r: Request):
    row = db.one("SELECT wheel, status, sha256 FROM skill_versions WHERE skill_id=? AND version=?", (r.path_params["id"], r.path_params["version"]))
    if not row:
        return err("not found", 404)
    if row["status"] == "revoked":
        return err("this version is revoked", 410)
    return Response(row["wheel"], media_type="application/octet-stream", headers={"x-sha256": row["sha256"]})


@needs("read")
async def skill_body(r: Request):
    row = db.one("SELECT body FROM skill_versions WHERE skill_id=? AND version=?", (r.path_params["id"], r.path_params["version"]))
    return Response(row["body"], media_type="text/markdown") if row else err("not found", 404)


@needs("publish")
async def publish_tool(r: Request):
    b = await r.json()
    if b.get("kind") not in ("builtin", "mcp"):
        return err("kind must be 'builtin' or 'mcp'")
    if b["kind"] == "mcp":
        spec = b.get("spec") or {}
        u = urlparse(str(spec.get("url", "")))
        if u.scheme not in ("http", "https") or u.netloc not in TOOL_HOSTS:
            return err(f"MCP servers may only be on {sorted(TOOL_HOSTS)}", 422)
        if not spec.get("allow") or not all(isinstance(x, str) for x in spec["allow"]):
            return err("an MCP entry must list the tool names an agent may use in spec.allow", 422)
        if "auth_env" in spec and not str(spec["auth_env"]).isidentifier():
            return err("spec.auth_env must name an environment variable, never hold a secret", 422)
    if db.one("SELECT 1 FROM tool_versions WHERE tool_id=? AND version=?", (b["id"], b["version"])):
        return err("already published; versions are immutable", 409)
    db.run(
        "INSERT INTO tool_versions VALUES (?,?,?,?,?,?,?,?)",
        (b["id"], b["version"], "draft", b["kind"], b.get("description", ""), json.dumps(b.get("spec", {})), now(), actor(r)),
    )
    db.audit(actor(r), "publish", f"tool:{b['id']}@{b['version']}")
    changed("tool", id=b["id"])
    return JSONResponse({"id": b["id"], "version": b["version"]}, status_code=201)


@needs("publish")
async def publish_ui(r: Request):
    b = await r.json()
    if db.one("SELECT 1 FROM ui_versions WHERE name=? AND version=?", (b["id"], b["version"])):
        return err("already published; versions are immutable", 409)
    db.run(
        "INSERT INTO ui_versions VALUES (?,?,?,?,?,?,?)",
        (b["id"], b["version"], "draft", b["component"], b.get("description", ""), now(), actor(r)),
    )
    db.audit(actor(r), "publish", f"ui:{b['id']}@{b['version']}")
    changed("ui", id=b["id"])
    return JSONResponse({"id": b["id"], "version": b["version"]}, status_code=201)


@needs("approve")
async def set_status(r: Request):
    kind, vid, version = r.path_params["kind"], r.path_params["id"], r.path_params["version"]
    if kind not in KINDS:
        return err("not found", 404)
    table, idcol = KINDS[kind]
    status = (await r.json()).get("status")
    if status not in STATUSES:
        return err(f"status must be one of {STATUSES}")
    row = db.one(f"SELECT * FROM {table} WHERE {idcol}=? AND version=?", (vid, version))
    if not row:
        return err("not found", 404)
    # Two-person rule: whoever published a version cannot approve it.
    if status == "approved" and row["published_by"] == actor(r):
        db.audit(actor(r), "denied", f"{kind}:{vid}@{version}", {"why": "self-approval"})
        return err("you published this version, so someone else must approve it", 403)
    if row["status"] == "revoked":
        return err("a revoked version cannot change status; publish a new version", 409)
    if status == "approved" and kind == "skills":
        sig = signer.sign(vid, version, row["sha256"])
        db.run("UPDATE skill_versions SET signature=?, approved_by=? WHERE skill_id=? AND version=?", (sig, actor(r), vid, version))
    db.run(f"UPDATE {table} SET status=? WHERE {idcol}=? AND version=?", (status, vid, version))
    db.audit(actor(r), "status", f"{kind}:{vid}@{version}", {"status": status})
    changed("status", kind=kind, id=vid, version=version, status=status)
    return JSONResponse({"id": vid, "version": version, "status": status})


@needs("read")
async def statuses(r: Request):
    """Batch status lookup, so a running conversation can notice a revocation."""
    out = []
    for it in (await r.json())["items"]:
        table, idcol = KINDS[it["kind"]]
        row = db.one(f"SELECT status FROM {table} WHERE {idcol}=? AND version=?", (it["id"], it["version"]))
        out.append({**it, "status": row["status"] if row else "missing"})
    return JSONResponse(out)


# ───────────── agent profiles ─────────────

def _missing(config: dict) -> list[str]:
    bad = []
    for kind, key, idk in (("skills", "skills", "id"), ("tools", "tools", "id"), ("ui", "ui", "name")):
        table, idcol = KINDS[kind]
        for it in config.get(key, []):
            if not db.one(f"SELECT 1 FROM {table} WHERE {idcol}=? AND version=?", (it[idk], it["version"])):
                bad.append(f"{kind}:{it[idk]}@{it['version']}")
    return bad


@needs("read")
async def list_agents(r: Request):
    out = []
    for a in db.q("SELECT * FROM agents"):
        a["pins"] = {p["env"]: p["revision_id"] for p in db.q("SELECT env, revision_id FROM env_pins WHERE agent_id=?", (a["id"],))}
        out.append(a)
    return JSONResponse(out)


@needs("read")
async def list_revisions(r: Request):
    rows = db.q("SELECT * FROM profile_revisions WHERE agent_id=? ORDER BY id DESC", (r.path_params["agent"],))
    for x in rows:
        x["config"] = json.loads(x["config"])
    return JSONResponse(rows)


@needs("publish")
async def create_revision(r: Request):
    agent = r.path_params["agent"]
    b = await r.json()
    config = b.get("config") or {}
    if not db.one("SELECT 1 FROM agents WHERE id=?", (agent,)):
        db.run("INSERT INTO agents VALUES (?,?)", (agent, agent))
    bad = _missing(config)
    if bad:
        return err("the profile references versions that are not registered", 422, missing=bad)
    rid = db.run(
        "INSERT INTO profile_revisions(agent_id, status, note, config, created_at, created_by) VALUES (?,?,?,?,?,?)",
        (agent, "draft", b.get("note", ""), json.dumps(config), now(), actor(r)),
    )
    db.audit(actor(r), "revision", f"agent:{agent}#{rid}", {"note": b.get("note", "")})
    changed("revision", agent=agent, revision=rid)
    return JSONResponse({"id": rid}, status_code=201)


@needs("approve")
async def set_revision_status(r: Request):
    rid = int(r.path_params["rid"])
    status = (await r.json()).get("status")
    if status not in STATUSES:
        return err(f"status must be one of {STATUSES}")
    rev = db.one("SELECT * FROM profile_revisions WHERE id=?", (rid,))
    if not rev:
        return err("not found", 404)
    if status == "approved" and rev["created_by"] == actor(r):
        db.audit(actor(r), "denied", f"revision#{rid}", {"why": "self-approval"})
        return err("you created this revision, so someone else must approve it", 403)
    db.run("UPDATE profile_revisions SET status=? WHERE id=?", (status, rid))
    db.audit(actor(r), "status", f"revision#{rid}", {"status": status})
    changed("status", kind="revision", id=rid, status=status)
    return JSONResponse({"id": rid, "status": status})


def _unservable(config: dict, env: str) -> list[str]:
    out = []
    for kind, key, idk in (("skills", "skills", "id"), ("tools", "tools", "id"), ("ui", "ui", "name")):
        table, idcol = KINDS[kind]
        for it in config.get(key, []):
            row = db.one(f"SELECT status FROM {table} WHERE {idcol}=? AND version=?", (it[idk], it["version"]))
            if not row or row["status"] not in SERVED[env]:
                out.append(f"{kind}:{it[idk]}@{it['version']} ({row['status'] if row else 'missing'})")
    return out


@needs("approve")
async def pin_env(r: Request):
    agent, env = r.path_params["agent"], r.path_params["env"]
    if env not in ENVIRONMENTS:
        return err(f"env must be one of {ENVIRONMENTS}")
    rid = int((await r.json())["revision"])
    rev = db.one("SELECT * FROM profile_revisions WHERE id=? AND agent_id=?", (rid, agent))
    if not rev:
        return err("revision not found for this agent", 404)
    if rev["status"] not in PINNABLE[env]:
        return err(f"{env} only takes {sorted(PINNABLE[env])} revisions; #{rid} is {rev['status']}", 409)
    if env != "dev" and rev["created_by"] == actor(r):
        return err(f"you created revision #{rid}, so someone else must pin it to {env}", 403)
    blocked = _unservable(json.loads(rev["config"]), env)
    if blocked:
        return err(f"{env} cannot serve everything in revision #{rid}", 409, blocked=blocked)
    db.run(
        "INSERT INTO env_pins VALUES (?,?,?,?,?) ON CONFLICT(agent_id, env) DO UPDATE SET revision_id=excluded.revision_id, updated_at=excluded.updated_at, updated_by=excluded.updated_by",
        (agent, env, rid, now(), actor(r)),
    )
    db.audit(actor(r), "pin", f"agent:{agent}/{env}", {"revision": rid})
    changed("pin", agent=agent, env=env, revision=rid)
    return JSONResponse({"agent": agent, "env": env, "revision": rid})


def _resolve(agent: str, env: str) -> dict | None:
    pin = db.one("SELECT revision_id FROM env_pins WHERE agent_id=? AND env=?", (agent, env))
    if not pin:
        return None
    rev = db.one("SELECT * FROM profile_revisions WHERE id=?", (pin["revision_id"],))
    config = json.loads(rev["config"])
    served = SERVED[env]
    excluded, skills, tools, ui = [], [], [], []
    for it in config.get("skills", []):
        row = db.one(f"SELECT {SKILL_COLS} FROM skill_versions WHERE skill_id=? AND version=?", (it["id"], it["version"]))
        (skills if row and row["status"] in served else excluded).append(row or {"id": it["id"], "version": it["version"], "status": "missing"})
    for it in config.get("tools", []):
        row = db.one("SELECT tool_id AS id, version, status, kind, description, spec FROM tool_versions WHERE tool_id=? AND version=?", (it["id"], it["version"]))
        if row:
            row["spec"] = json.loads(row["spec"] or "{}")
        (tools if row and row["status"] in served else excluded).append(row or {"id": it["id"], "version": it["version"], "status": "missing"})
    for it in config.get("ui", []):
        row = db.one("SELECT name AS id, version, status, component FROM ui_versions WHERE name=? AND version=?", (it["name"], it["version"]))
        (ui if row and row["status"] in served else excluded).append(row or {"id": it["name"], "version": it["version"], "status": "missing"})
    out = {
        "agent": agent, "env": env, "revision": rev["id"], "revision_status": rev["status"],
        "config": {k: config.get(k) for k in ("model", "prompt", "questions")},
        "skills": skills, "tools": tools, "ui": ui, "excluded": excluded,
    }
    out["etag"] = hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest()[:16]
    return out


@needs("read")
async def resolve(r: Request):
    agent, env = r.path_params["agent"], r.query_params.get("env", "dev")
    key = f"{agent}:{env}"
    cached = bus.get(key)
    if cached is None:
        res = _resolve(agent, env)
        if res is None:
            return err(f"{agent} has no revision pinned in {env}", 404)
        cached = json.dumps(res)
        bus.put(key, cached)
    etag = json.loads(cached)["etag"]
    if r.headers.get("if-none-match") == etag:
        return Response(status_code=304)
    return Response(cached, media_type="application/json", headers={"etag": etag, "x-registry-cache": bus.mode})


# ───────────── usage and audit ─────────────

@needs("usage")
async def report_usage(r: Request):
    b = await r.json()
    db.run(
        "INSERT INTO usage VALUES (?,?,?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET revision_id=excluded.revision_id, snapshot=excluded.snapshot, last_seen=excluded.last_seen",
        (b["thread_id"], b["agent"], b["env"], b["revision"], json.dumps(b.get("snapshot", {})), now(), now()),
    )
    return JSONResponse({"ok": True})


@needs("read")
async def list_usage(r: Request):
    rows = db.q("SELECT * FROM usage ORDER BY last_seen DESC LIMIT 100")
    for x in rows:
        x["snapshot"] = json.loads(x["snapshot"])
    return JSONResponse(rows)


@needs("approve")
async def list_audit(r: Request):
    rows = db.q("SELECT * FROM audit ORDER BY id DESC LIMIT 200")
    for x in rows:
        x["detail"] = json.loads(x["detail"])
    return JSONResponse(rows)


@needs("admin")
async def create_token(r: Request):
    b = await r.json()
    roles = b.get("roles", "reader")
    if any(x not in ("reader", "agent", "publisher", "approver", "admin") for x in roles.split(",")):
        return err("unknown role")
    token = new_token()
    db.run("INSERT INTO tokens(name, roles, token_hash, created_at, created_by) VALUES (?,?,?,?,?)", (b["name"], roles, hash_token(token), now(), actor(r)))
    db.audit(actor(r), "token-create", b["name"], {"roles": roles})
    return JSONResponse({"name": b["name"], "roles": roles, "token": token, "note": "shown once"}, status_code=201)


@needs("admin")
async def list_tokens(r: Request):
    return JSONResponse(db.q("SELECT id, name, roles, created_at, created_by, revoked FROM tokens"))


@needs("admin")
async def revoke_token(r: Request):
    db.run("UPDATE tokens SET revoked=1 WHERE name=?", (r.path_params["name"],))
    db.audit(actor(r), "token-revoke", r.path_params["name"])
    return JSONResponse({"revoked": r.path_params["name"]})


@needs("read")
async def signing_key(r: Request):
    """For operators to pin out of band. Agents must not trust a key fetched at runtime."""
    return JSONResponse({"key_id": signer.key_id, "public_key": signer.public_pem})


@needs("approve")
async def verify_audit(r: Request):
    return JSONResponse(db.verify_audit())


@needs("read")
async def me(r: Request):
    return JSONResponse(r.state.principal)


async def health(r: Request):
    return JSONResponse({"ok": True, "bus": bus.mode, "db": str(DB_PATH.name)})


app = Starlette(
    routes=[
        Route("/v1/health", health),
        Route("/v1/status", statuses, methods=["POST"]),
        Route("/v1/skills", publish_skill_wheel, methods=["POST"]),
        Route("/v1/skills/compose", compose_skill, methods=["POST"]),
        Route("/v1/skills/{id}/{version}/wheel", skill_wheel),
        Route("/v1/skills/{id}/{version}/body", skill_body),
        Route("/v1/tools", publish_tool, methods=["POST"]),
        Route("/v1/ui", publish_ui, methods=["POST"]),
        Route("/v1/agents", list_agents),
        Route("/v1/agents/{agent}/revisions", list_revisions),
        Route("/v1/agents/{agent}/revisions", create_revision, methods=["POST"]),
        Route("/v1/revisions/{rid}/status", set_revision_status, methods=["PUT"]),
        Route("/v1/agents/{agent}/pins/{env}", pin_env, methods=["PUT"]),
        Route("/v1/agents/{agent}/resolve", resolve),
        Route("/v1/usage", report_usage, methods=["POST"]),
        Route("/v1/usage", list_usage),
        Route("/v1/audit", list_audit),
        Route("/v1/audit/verify", verify_audit),
        Route("/v1/me", me),
        Route("/v1/signing-key", signing_key),
        Route("/v1/tokens", create_token, methods=["POST"]),
        Route("/v1/tokens", list_tokens),
        Route("/v1/tokens/{name}", revoke_token, methods=["DELETE"]),
        Route("/v1/{kind}", list_items),
        Route("/v1/{kind}/{id}/{version}/status", set_status, methods=["PUT"]),
    ],
    middleware=[Middleware(Auth)],
)
