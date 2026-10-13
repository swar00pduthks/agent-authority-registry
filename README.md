# agent-authority-registry

Governed registry for agent skills, MCP tools and profiles: versioned, signed, audited. This repo holds the registry service, its client middleware for LangGraph deep agents, an admin console, and a guided-path example agent (assistant-ui) that runs on it.

## Guided-path example

A LangGraph deep agent shows one short requirements form (seven questions, one submission), recommends a no-code, low-code or pro-code path, then walks you through the steps. The React app shows the chat on the left and your route on the right.

```
backend/    Python deep agent (agent.py), registry service and client, MCP demo server
frontend/   React + Vite + assistant-ui, with the route panel
```

## How it fits together

| Piece | Where | Job |
|---|---|---|
| Requirements form | `backend/agent.py` (`collect_requirements`; questions come from the registry profile) | One `interrupt({kind:"form", questions, prefill})`; the UI resumes once with a JSON string of all answers |
| `ask_user` | `agent.py` | Pauses the graph for each `[You]` step; the UI shows answer buttons |
| `recommend_path` | `agent.py` | Records the path, the reason and 4-6 requirement phrases |
| Path steps | `backend/skills_src/*-path/SKILL.md` (published to the registry) | The agent reads the matching skill and publishes its steps with the built-in `write_todos` |
| `[You]` / `[Agent]` prefixes | skills | Mark who does each step; the panel draws them differently |
| `publish_file` | `agent.py`, `webapp.py` | The agent saves a deliverable under `/outputs/` and publishes it; `webapp.py` serves it at `/files`, so the panel can open and download it |
| File attachments | `frontend/src/lib/attachments.ts` | Attached files go to the agent as base64 `file` blocks (10 MB limit) |
| Route panel | `frontend/src/components/panel/` and `lib/route.ts` | Four sections built from the thread's tool calls, with no separate state: **Plan**, **Output**, **Input**, **Skills and tools** |

The Plan shows the recommended path, why it fits and your requirements, then the steps. Each step expands to show what the agent did and any file it made. Long routes show the current step with one before and two after. Output opens when the first file arrives. The form mirrors into Input live as you answer, and Input collapses once the form is submitted. Skills and tools is collapsed by default.

To add or change a path, publish a new skill version in the admin console. The panel needs no changes.

## Registry service (skills, tools, UI mapping, agent profile)

Nothing about the agent's skills, tools, questions or tool UIs is hard-coded. The agent asks a registry service for a **profile** (a pinned set of versions) at the start of each conversation, the same way Claude loads a catalogue of names and descriptions first and fetches bodies on demand.

```
registry_service/   Starlette app + SQLite (single writer) + Redis pub/sub
registry_client/    RegistryClient, RegistryProfile middleware, MCP tool loading
mcp_servers/        demo MCP server (platform_standards) the registry points at
frontend/src/admin/ admin console at /admin
```

| Concern | How |
|---|---|
| Versions | Skills, tools and UI mappings are immutable once published. A profile revision is an immutable config that lists exact versions. |
| Status | draft, approved, deprecated, revoked. dev serves draft+approved+deprecated; uat and prod serve approved+deprecated; revoked is never served. |
| Environment | Each environment pins one profile revision. Changing the pin changes new conversations, with no restart. |
| Per-conversation snapshot | A conversation keeps the revision it started on. Each turn the agent checks status; if a pinned item was revoked it re-resolves. |
| Skills | Wheels with a sha256 and an Ed25519 signature added on approval. Fetched lazily on first read, verified, cached by hash. |
| Tools | Come from MCP servers. The registry holds the server URL, an allow-list of tool names and a digest of their definitions (rug-pull protection). Names and descriptions go in the prompt; schemas bind after the agent calls `load_tool`. |
| Tool UIs | Registry picks among components bundled in the app (`requirements-stepper`, `ask-user-card`, `hidden`). It never ships code to the browser. |
| Security | Hashed bearer tokens with roles (reader, agent, publisher, approver, admin); publisher cannot approve their own work; only approvers pin to uat/prod; hash-chained audit log; rate limits; size caps; host allow-list; untrusted tool-result wrapping. |

Prototype limits: SQLite is single-writer (use Postgres), the signing key is a file (use KMS/HSM), tokens are static (use OIDC or workload identity), and per-user entitlements are not enforced.

## Run with Docker

```bash
docker compose up --build                    # scripted agent, no API key needed
# real model: LANGGRAPH_CONFIG=langgraph.json ANTHROPIC_API_KEY=sk-... docker compose up --build
```

Open http://localhost:4173 for the chat and http://localhost:4173/admin for the console. Get console tokens with `docker compose exec registry cat /data/.registry_tokens.json` (alice publishes, bob approves). Services: `redis`, `registry-init` (bootstrap and seed, runs once), `registry` (:8800), `mcp` (demo MCP server), `agent` (LangGraph, :2024), `frontend` (:4173). The registry database and signing key live in the `registry-data` volume; `docker compose down -v` resets them.

The compose setup was written without a Docker daemon available, so it has not been run end to end. The seed step, MCP host handling and environment overrides were checked natively; report anything that fails on first `up`.

Design notes: [docs/design.md](docs/design.md).

## Run it (without Docker)

Needs Python 3.11+, Node 20+ and Redis (optional: without `REDIS_URL` the registry falls back to in-process invalidation).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                          # add ANTHROPIC_API_KEY for the real model

redis-server --port 6390 &                    # optional
export REDIS_URL=redis://127.0.0.1:6390/0
python -m registry_service.bootstrap          # writes .registry_tokens.json (alice=publisher, bob=approver, admin, agent-guide)
python -m registry_service.seed               # skills, tools, UI map, profile #1 pinned in dev, uat, prod
uvicorn registry_service.app:app --port 8800 &
python mcp_servers/standards_server.py &      # MCP server on :8810

curl -s localhost:8800/v1/signing-key -H "Authorization: Bearer $(jq -r '.["agent-guide"]' .registry_tokens.json)" | jq -r .public_key > registry_pubkey.pem
export REGISTRY_TOKEN=$(jq -r '.["agent-guide"]' .registry_tokens.json)
export REGISTRY_PUBKEY_FILE=$PWD/registry_pubkey.pem SKILL_ENV=dev
langgraph dev --allow-blocking                # :2024 (real model)
# or, no API key: langgraph dev --config langgraph.scripted.json --allow-blocking
```

Frontend:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (chat), http://localhost:5173/admin (console); proxies /api and /registry
```

Sign in to `/admin` with the tokens in `.registry_tokens.json`. Try: as alice publish low-code-path 1.1.0; as bob approve it, create a profile revision that uses it, approve and pin it to dev; start a new chat and see `low-code-path v1.1.0 · dev` in the panel.

Tests: `python tests/test_registry_security.py` (23 checks).

Preview the panel with static data: `/?demo=empty|discover|plan|done`.

## Notes

- The stream uses `messages-tuple`, `updates` and `values`. `updates` carries the interrupt, so without it the form never appears.
- If your server runs on a different port, set `LANGGRAPH_URL` (dev proxy) or `VITE_LANGGRAPH_URL` (build).
- The agent can read and write inside `backend/` through `FilesystemBackend`. For production, use a restricted backend.
- deepagents loads skill metadata once per thread; the registry middleware re-pins it when the profile changes or an item is revoked. `write_todos` is added with `TodoListMiddleware` because the installed deepagents version does not include it by default.
- Runtime files (`registry.db*`, `registry.signing.key`, `.registry_tokens.json`, `registry_cache/`, `skill_cache/`) are generated and must not be committed.
- Fonts are bundled with `@fontsource`, so the app makes no external requests.

## Frontend layout

```
src/admin/        registry console (skills, tools and UI, agents, activity)
src/lib/          agentConfig (registry UI map), langgraph client, route model (pure), attachments, fixtures, form types
src/hooks/        useResume (resume the paused graph)
src/components/
  chat/           Chat, Messages (tool routing), Composer, Welcome, AskUserCard, ToolChip
  requirements/   RequirementsStepper (presentational), RequirementsToolUI (connector), DraftContext
  panel/          RoutePanel and its sections (presentational, driven by RouteModel)
```

There are no higher-order components. Behaviour is shared with hooks, and UI is composed from assistant-ui primitives and a tool-name-to-component map.
