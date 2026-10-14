"""Security and policy checks for the registry service. Run: python tests/test_registry_security.py"""
import json
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["REGISTRY_DB"] = str(tmp / "t.db")
os.environ["REGISTRY_TOKENS"] = str(tmp / "tokens.json")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient  # noqa: E402

from registry_service import bootstrap  # noqa: E402
from registry_service.app import app, db  # noqa: E402

bootstrap.main()
T = json.loads((tmp / "tokens.json").read_text())
c = TestClient(app, base_url="http://registry")


def req(who, method, url, **kw):
    h = {"authorization": f"Bearer {T[who]}"} if who else {}
    return c.request(method, url, headers=h, **kw)


SKILL = {"id": "demo-path", "version": "1.0.0", "label": "Demo", "blurb": "b", "accent": "no-code",
         "skill_md": "---\nname: demo-path\ndescription: Demo skill. Use when testing.\n---\n# Demo\n"}
checks = []


def check(name, cond):
    checks.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


check("no token is rejected", req(None, "GET", "/v1/skills").status_code == 401)
check("a wrong token is rejected", c.get("/v1/skills", headers={"authorization": "Bearer nope"}).status_code == 401)
check("a reader cannot publish", req("reader", "POST", "/v1/skills/compose", json=SKILL).status_code == 403)
check("an agent cannot publish", req("agent-guide", "POST", "/v1/skills/compose", json=SKILL).status_code == 403)
check("a publisher publishes a draft", req("alice", "POST", "/v1/skills/compose", json=SKILL).status_code == 201)
check("versions are immutable", req("alice", "POST", "/v1/skills/compose", json=SKILL).status_code == 409)
check("a publisher cannot approve", req("alice", "PUT", "/v1/skills/demo-path/1.0.0/status", json={"status": "approved"}).status_code == 403)
check("a different approver can", req("bob", "PUT", "/v1/skills/demo-path/1.0.0/status", json={"status": "approved"}).status_code == 200)
sig = db.one("SELECT signature FROM skill_versions WHERE skill_id='demo-path'")["signature"]
check("approval signs the version", bool(sig))
check("a revoked version cannot be revived", (
    req("bob", "PUT", "/v1/skills/demo-path/1.0.0/status", json={"status": "revoked"}).status_code == 200
    and req("bob", "PUT", "/v1/skills/demo-path/1.0.0/status", json={"status": "approved"}).status_code == 409))
check("a revoked wheel is not served", req("agent-guide", "GET", "/v1/skills/demo-path/1.0.0/wheel").status_code == 410)

tool = {"id": "t", "version": "1.0.0", "kind": "mcp", "spec": {"url": "http://169.254.169.254/mcp", "allow": ["x"]}}
check("an MCP entry cannot target a metadata address", req("alice", "POST", "/v1/tools", json=tool).status_code == 422)
tool["spec"] = {"url": "http://127.0.0.1:8810/mcp", "allow": []}
check("an MCP entry must name the tools it allows", req("alice", "POST", "/v1/tools", json=tool).status_code == 422)
tool["spec"] = {"url": "http://127.0.0.1:8810/mcp", "allow": ["x"], "auth_env": "sk-live-abc123!"}
check("an MCP entry cannot carry a secret", req("alice", "POST", "/v1/tools", json=tool).status_code == 422)

cfg = {"skills": [{"id": "demo-path", "version": "1.0.0"}]}
check("a profile cannot reference unknown versions", req("alice", "POST", "/v1/agents/x/revisions", json={"config": {"skills": [{"id": "nope", "version": "9"}]}}).status_code == 422)
req("alice", "POST", "/v1/skills/compose", json={**SKILL, "version": "2.0.0"})
cfg = {"skills": [{"id": "demo-path", "version": "2.0.0"}]}
rid = req("alice", "POST", "/v1/agents/x/revisions", json={"config": cfg}).json()["id"]
check("a draft revision cannot go to prod", req("bob", "PUT", "/v1/agents/x/pins/prod", json={"revision": rid}).status_code == 409)
check("a draft revision can go to dev", req("bob", "PUT", "/v1/agents/x/pins/dev", json={"revision": rid}).status_code == 200)
check("an approver cannot approve their own revision", req("alice", "PUT", f"/v1/revisions/{rid}/status", json={"status": "approved"}).status_code == 403)
req("bob", "PUT", f"/v1/revisions/{rid}/status", json={"status": "approved"})
check("an approved revision with a draft skill cannot go to prod", req("bob", "PUT", "/v1/agents/x/pins/prod", json={"revision": rid}).status_code == 409)

big = c.post("/v1/skills", headers={"authorization": f"Bearer {T['alice']}"}, files={"file": ("x.whl", b"0" * 2_000_000)})
check("an oversize upload is rejected", big.status_code == 422)

check("the audit chain verifies", req("bob", "GET", "/v1/audit/verify").json()["ok"])
db.run("UPDATE audit SET actor='mallory' WHERE id=3")
check("editing the audit log is detected", req("bob", "GET", "/v1/audit/verify").json()["ok"] is False)
check("denied attempts were audited", any(r["action"] == "denied" for r in db.q("SELECT action FROM audit")))

failed = [n for n, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
