# AGENTS.md

Guidance for coding agents working in this repo. Humans: see README.md.

## What this is
A governed registry for agent skills, MCP tools, UI mappings and agent profiles, plus a LangGraph deep-agent client and a guided-path example app (assistant-ui). Design notes: `docs/design.md`.

```
backend/registry_service/   Starlette app, SQLite, Redis pub/sub: versions, status, env pins, signing, audit
backend/registry_client/    RegistryClient + RegistryProfile middleware (snapshot, lazy skill fetch, MCP tools)
backend/mcp_servers/        demo MCP server (platform_standards)
backend/agent.py            the deep agent; backend/dev/scripted_agent.py is a fake model for tests
backend/skills_src/         source skills that seed.py publishes
frontend/src/admin/         registry console (/admin); frontend/src/components, lib: chat app and route panel
e2e/dynamic_flow.py         Playwright test of the full flow
```

## Commands
Setup: `cd backend && pip install -r requirements.txt`; `cd frontend && npm ci`.

| Task | Command (from repo root) |
| --- | --- |
| Security tests | `cd backend && python tests/test_registry_security.py` (expect `23/23 passed`) |
| Types + build | `cd frontend && npm run build` |
| Browser test | needs running stack and a fresh DB, see README "Test everything"; `python e2e/dynamic_flow.py` |
| Whole stack | README "Run it", or `docker compose up --build` (compose is untested end to end) |

Start order matters: MCP server, then `bootstrap`, then `seed`, then registry, then agent, then frontend.

Run the security tests and `npm run build` before every commit. Run the browser test when you change the registry API, the middleware, the admin console or the route panel.

## Rules that must keep holding
- Published skill, tool and UI versions are immutable. Never add an update path; publish a new version.
- A publisher cannot approve their own work; only approvers pin to uat/prod; revoked items are never served. The server enforces this; hiding buttons in the UI is not enforcement.
- Never put secrets in the registry. MCP `auth_env` holds an environment variable name only.
- The registry never ships executable code to the browser or the agent. Tools come from allow-listed MCP servers; UI entries pick among components bundled in `frontend/src/lib/agentConfig.tsx`.
- Every state change and every denied attempt goes through `db.audit()` so the hash chain stays valid.
- Tool results from MCP servers are untrusted: keep the wrapper and the 64 KB cap.
- Change behaviour by adding tests in `backend/tests/test_registry_security.py`; keep all checks passing.

## Conventions
- Python: type hints, small functions, no new dependencies without adding them to `backend/requirements.txt`.
- Frontend: hooks and composition; no higher-order components. Presentational components take typed props; `lib/route.ts` stays a pure function of messages.
- New UI tool component: add it to the `COMPONENTS` map, then register a UI mapping in the registry (seed or console).
- Environment variables are documented in `backend/.env.example`.

## Do not commit
`backend/registry.db*`, `registry.signing.key`, `.registry_tokens.json`, `registry_pubkey.pem`, `registry_cache/`, `skill_cache/`, `backend/outputs/*`, `.env`, `node_modules/`, `frontend/dist/`, `e2e/shots/`. `.gitignore` covers these.

## Known limits (do not claim otherwise)
SQLite is single-writer (use Postgres in production); the signing key is a file (use KMS/HSM); tokens are static (use OIDC); per-user entitlements are not enforced; no load test has been run; the profile `model` field is informational; the Docker compose stack has not been run end to end.
