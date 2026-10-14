# Guided path agent: design decisions and implementation notes

Oct 13, 2026 · @Swaroop Duth

## Overview

The app takes a person from a vague idea to a step-by-step route for building an AI agent: a chat on the left, and a four-section panel on the right that shows the plan, the files in and out, and the skills and tools used.

1. The user picks a suggested prompt or types their own, and can attach files.
2. The agent opens one requirements form with seven questions. The panel's Input section fills as each answer is chosen.
3. After the form is submitted, the agent recommends one of three paths (no-code, low-code or pro-code) with a reason and requirement chips.
4. The agent reads that path's skill and publishes its steps as the plan. Each step is marked **You** or **Agent**.
5. The agent works through its steps and pauses on every step that needs the user. Files it creates appear in Output.

Sections 3 and 4 give the UX and backend decisions with the reasons. Section 5 separates what assistant-ui and LangGraph deep agents provide from what we wrote. Sections 6 and 7 cover wiring and component structure, and section 9 is a checklist for comparing with your own build.

Versions tested: assistant-ui react 0.15.28, react-langgraph 0.14.35, react-markdown 0.14.22, langgraph-sdk 1.12.4, deepagents 0.7.24, langgraph-api 0.16.0, React 19, Vite 6, TypeScript 5.6.

## 2. Architecture at a glance

*(Architecture diagram: browser, server, files. See the live doc.)*

The browser and the server only exchange messages. The agent never draws UI: it calls a tool, the tool pauses the graph with `interrupt()`, and the matching tool UI in the chat renders the form or the question and resumes the graph with a string. The right panel owns no state of its own. It is computed from the thread's tool calls, plus a draft that the form reports before it is submitted.

## 3. UX design decisions

**Layout.** Chat on the left, a "route" panel on the right (a Copilot 365 or Claude style side panel). On mobile the panel becomes a bottom sheet opened from a Route pill in the header.

**One Plan, not two.** We considered a separate "guided path" panel next to the agent's own plan. We merged them: the recommended path is the header of the Plan, and the steps from `write_todos` sit under it. Two plans would show the same thing twice.

**Section order: Plan, Output, Input, Skills and tools.** This is the order of what the person cares about while working.

- Plan is always open.
- Output opens the first time a file is published.
- Input is open during discovery, then collapses.
- Skills and tools is closed by default; it is for people who want to audit the agent.

**Route-map metaphor.** The recommended path is a coloured line (green no-code, amber low-code, blue pro-code). Every step is a station. Steps the person must do are larger interchanges with a person icon, so "you versus agent" is visible without reading.

**Windowed plan.** Nine steps pushed Output off screen. The panel shows the current step, one before and two after, with "Show N more" to expand. Each step expands to show what the agent did and any file it made.

**Discovery is one form, not seven chat turns.** Seven separate questions in the chat felt slow and left the panel with nothing to show. The form is a stepper: one question at a time, Back and Next, a progress bar, a final Review screen with a Change link per answer, and one submission. While the person answers, the panel's Plan shows progress and its Input section fills with each answer. Choices are options with 1 to 9 keyboard shortcuts, and every question has a free-text field.

**Prefill.** If the opening message already says what the AI should do (for example from a suggested prompt), the agent passes `prefill` and the first question is pre-selected, with a hint to change it.

**Composer is locked while the agent waits** and says why ("Finish the form above to continue"), so the thread cannot fork.

**Welcome screen** has four suggested prompts and explains what happens next.

**Quality floor.** Dark mode, bundled fonts (no external requests), visible focus, reduced-motion respected, native `details` for disclosure, and a mobile dialog with focus trapping, Escape handling and an inert background.

## 4. Backend design decisions

**Questions are data.** The seven questions live in a `QUESTIONS` constant in `agent.py`, and are sent to the UI inside the interrupt payload. The model cannot reword, drop or reorder them, and the UI needs no copy of them.

**One interrupt for the whole form.** `collect_requirements` calls `interrupt({kind: "form", title, questions, prefill})` once. The resume value is a JSON string of answers keyed by question id. The tool validates it and returns `{"answers": [{id, question, answer}]}`, which is what the panel reads afterwards.

**Tools.**

- `collect_requirements(prefill)`: the form. Called exactly once, first.
- `recommend_path(path, reason, requirements)`: validates the path name and returns a short note. Its arguments are what the panel renders; the return value is not used.
- `ask_user(question, options)`: one interrupt per step that only the person can do.
- `publish_file(path)`: checks the file is under this conversation's `outputs/`, then returns `{type, name, mime, size, signed url}`.

**System prompt as a four-phase script.** Collect, recommend, publish the plan (read the skill and call `write_todos`), walk the steps. The strictest requirement wins when answers conflict.

**Skills hold the steps.** One `SKILL.md` per path, with `[You]` and `[Agent]` prefixes. Adding or changing a path means editing a skill; the panel does not change.

**Files.** The filesystem backend maps `/outputs` to a conversation-specific directory. `publish_file` returns a signed URL that expires after seven days; the Starlette app verifies it before serving files at `/files`.

**Testing without an API key.** `dev/scripted_agent.py` is a fake chat model that streams scripted tool calls. The real graph, tools, skills and interrupts run, so the whole UI can be exercised and screenshotted.

## 5. Provided by the libraries versus built here

| Concern | Provided by assistant-ui or LangGraph deep agents | Built in this example |
| --- | --- | --- |
| Agent loop, planning | `create_deep_agent`, built-in `write_todos`, file tools (`read_file`, `write_file`), sub-agents | System prompt, four custom tools |
| Skills | Skills loading from a folder (`skills=["/skills/"]`) and reading `SKILL.md` | The three path skills and the `[You]` / `[Agent]` convention |
| Human in the loop | `interrupt()` and resume through a command | The form payload (`kind: "form"`), the JSON-string resume contract, validation |
| Server | `langgraph dev`, threads, runs, streaming, `http.app` hook | `webapp.py` that verifies signed `/files` URLs |
| File access | `FilesystemBackend` with virtual paths | `ThreadFilesystemBackend` and signed `publish_file` URLs |
| Chat runtime | `useLangGraphRuntime`, thread and message state, attachments adapter interface | `stream`, `create`, `load` callbacks; base64 file adapter with a 10 MB limit |
| Chat UI | Thread, Message, Composer and Attachment primitives, `AuiIf`, markdown part | All markup and styling, welcome screen, suggested prompts, locked composer |
| Tool rendering | `tools.by_name` and `Fallback` on message parts, tool-call args and result | `RequirementsToolUI`, `AskUserCard`, `ToolChip`; hiding `write_todos` and `recommend_path` in chat |
| Interrupts in UI | `useLangGraphInterruptState`, `useLangGraphSendCommand` | `useResume` (busy state) and the stepper |
| Right panel | Nothing | The whole panel: route model, sections, stations, file cards |
| Panel data | Messages with tool-call parts | `buildRouteModel`, a pure function from messages, interrupt and draft to the panel model |
| Draft sharing | Nothing | `DraftContext` so the form and panel can mirror each other before submit |
| Design | Nothing (unstyled primitives) | Tokens, route-map visual language, bottom sheet, dark mode |

Rule of thumb: assistant-ui gives you the conversation and the hooks to reach the paused graph. Everything that looks like a product (panel, form, file cards) is yours.

## 6. How it is wired

**Runtime.** `App.tsx` calls `useLangGraphRuntime({stream, create, load, adapters: {attachments}})` and wraps the app in `AssistantRuntimeProvider`. `lib/langgraph.ts` creates the SDK client. `stream` calls `client.runs.stream` with stream modes `messages-tuple`, `updates` and `values`. The `updates` mode is required: it is what carries the interrupt, and without it the form never appears.

**Form round trip.**

1. The agent calls `collect_requirements`. The tool calls `interrupt()` with the form payload.
2. The stream delivers the tool call (as a message part) and the interrupt (through `useLangGraphInterruptState`).
3. `RequirementsToolUI` is registered under `tools.by_name.collect_requirements`. While the tool has no result and the interrupt is a form, it renders `RequirementsStepper`.
4. The stepper reports every change to `DraftContext`. `useRouteModel` reads the draft, so the panel mirrors the answers.
5. On submit, `useResume` calls `sendCommand({resume: JSON.stringify(answers)})`. The graph continues, the tool returns its JSON, and the tool part now has a result.
6. The chat collapses the form into one line ("Requirements sent, 7 answers"). The panel switches from draft answers to the submitted ones.

**Plan and path.** The agent calls `recommend_path` and `write_todos`. Their arguments are in the message parts, so `buildRouteModel` reads them directly. Both are hidden in the chat with a component that returns null.

**Step activity.** While walking a message's tool calls, `buildRouteModel` remembers the step marked `in_progress` by the last `write_todos`, and attributes later tool calls (reads, writes, publishes) to it. That is what a step shows when expanded.

**Skills.** A `read_file` call on `/skills/<name>/SKILL.md` adds that skill to the panel.

**Output files.** `publish_file` returns JSON. The model parses it into a file reference. The panel builds the link from the signed `/files/...` URL and the dev proxy forwards `/api` to the LangGraph server.

**Input files.** Attachments go through an adapter that converts the file into a base64 `file` content block. The panel lists them from the user message's attachments.

**Question steps.** `[You]` steps use `ask_user`. `AskUserCard` shows buttons (keys 1 to 4 work) and resumes with the chosen string.

## 7. Frontend component architecture

**Honest note on higher-order components: there are none.** No function takes a component and returns a component. Modern React and TypeScript practice prefers hooks for shared behaviour and composition for shared structure, and that is what this code uses. A HOC would only make sense for a cross-cutting wrapper (an error boundary, `memo`, an auth gate), and this example has none of those. If your implementation uses HOCs, compare them against the hook that replaces each.

**Patterns used.**

- **Container and presentational split.** `RequirementsToolUI` (container) talks to assistant-ui and LangGraph; `RequirementsStepper` (presentational) takes typed props and can be tested or reused without either library. `RoutePanel` and its parts are presentational and only read a `RouteModel`.
- **Custom hooks.** `useResume` (resume plus busy state), `useRouteModel` (messages, interrupt and draft to model), `useDraft` (context access).
- **Pure functions for logic.** `buildRouteModel` has no React in it, so it can be unit-tested with plain message arrays. `fixtures.ts` feeds the panel the same shape for the `?demo=` previews.
- **Composition through library slots.** Tool UIs are plugged in by name (`tools.by_name`), with `ToolChip` as the fallback. Primitives (`ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive`) are composed rather than wrapped.
- **Context for one cross-tree value.** `DraftContext` carries the form draft from the chat to the panel.
- **Typed contracts.** `lib/requirements.ts` holds `Question`, `FormInterrupt`, `Draft` and type guards (`isFormInterrupt`) so that data from the graph is checked once, at the edge.

**File layout.**

```
src/lib/          langgraph client, route model, attachments, fixtures, form types
src/hooks/        useResume
src/components/
  chat/           Chat, Messages, Composer, Welcome, AskUserCard, ToolChip
  requirements/   RequirementsStepper, RequirementsToolUI, DraftContext
  panel/          RoutePanel, Section, PlanBody, Station, InputBody,
                  SkillsToolsBody, FileCard, icons
```

**Known simplifications.** There are no automated unit tests (only a scripted end-to-end run), and `Messages.tsx` exports `PaperIcon` for the composer, which a shared `icons` module would be cleaner for.

## 8. Gotchas we hit

- **No form, no question card:** the interrupt only arrives in the `updates` stream mode. Add it to `streamMode`.
- **Resume value must be a string.** For the form, send `JSON.stringify(answers)` and parse it in the tool.
- **Interrupt state clears on resume** before the tool result arrives. Without a local flag the UI briefly shows "Preparing your questions" after submit; `RequirementsToolUI` remembers it had a form.
- **Fake models for tests:** `GenericFakeChatModel` does not stream tool calls. A small `BaseChatModel` subclass with `_stream` yielding `tool_call_chunks` does.
- **Scripted agent is stateful.** Restart the server before each end-to-end run.
- **`langgraph dev` blockbuster error** in some environments: run with `--allow-blocking` (dev only). Use `--no-reload` when files change under the working directory, or it restarts in a loop.
- **Fonts:** Google Fonts can be blocked in locked-down networks. Fonts are bundled with `@fontsource`.
- **Output pushed off screen** by long plans: window the plan.
- **Closed mobile sheet** still received keyboard focus until it was `visibility: hidden`.
- **`FilesystemBackend` can read and write under `backend/`.** Fine for a demo; for production use a read-only skills location or a restricted backend.

## 9. Comparison checklist and production hardening

**Compare with your implementation.**

- Where do the discovery questions live: prompt text, or data sent to the UI?
- How many interrupts does discovery use, and what is the resume contract?
- Does the panel have its own store, or is it derived from the thread? What happens on reload?
- How are plan steps attributed to "you" or "agent", and who owns that convention?
- Is the stream subscribed to `updates` so interrupts arrive?
- How do files reach the user: inline in chat, or a published list with links?
- Are shared behaviours hooks, wrappers or HOCs? Does anything need an error boundary?
- Does the form mirror into the panel before submit?
- What happens on mobile, in dark mode, with reduced motion, and with only a keyboard?

**Before production.**

- Replace the in-memory server with a persistent checkpointer and a real deployment; thread history then survives restarts.
- Use durable object storage and configure the same `OUTPUT_FILE_SIGNING_KEY` across server instances.
- Restrict the agent's filesystem backend and move skills to a read-only location.
- Add unit tests for `buildRouteModel` and the stepper, and keep the scripted end-to-end run in CI.
- Add an error boundary around the chat and panel, and show a retry when a stream fails.
- Cap attachment size and types on the server, not only in the browser.
- Log tool calls for audit if regulated data is in scope.

## 10. Registry service: dynamic skills, tools and UI

**Update.** Sections 4 and 5 describe the first version, where questions, prompt and skills lived in code or files. They now come from a registry service; the agent code only holds built-in tool implementations. Also, deepagents loads skill metadata once per thread, not every turn; the registry middleware resets it when the profile changes.

The model follows how Claude loads skills and tools: a catalogue of names and descriptions up front, the body or schema only when needed, a snapshot per conversation, and status and environment deciding what is served.

| Concern | Decision |
| --- | --- |
| Versions | Skills, tools and UI mappings are immutable once published. An agent profile revision is an immutable JSON of exact versions, prompt sections and questions. |
| Status | draft, approved, deprecated, revoked. dev serves draft, approved and deprecated; uat and prod serve approved and deprecated; revoked is never served. |
| Environment | Each environment pins one profile revision. Changing a pin changes new conversations with no restart (ETag resolve, Redis pub/sub invalidation, in-process fallback). |
| Snapshot | A conversation keeps the revision it started on, stored in graph state. Each turn the agent checks status; if a pinned item was revoked it re-resolves. The UI renders from that same conversation snapshot. |
| Skills | Python wheels with a sha256 and an Ed25519 signature added at approval. The agent fetches lazily on first read of `/skill_cache/<id>/<ver>/SKILL.md`, verifies, and caches by hash. |
| Tools | Come from MCP servers. The registry stores server URL, an allow-list of tool names and a digest of their definitions, so a changed definition is refused (rug-pull protection). Names and descriptions sit in the prompt; the schema binds after the agent calls `load_tool`. Results are wrapped as untrusted and capped at 64 KB. |
| Tool UIs | The registry picks among components bundled in the app (`requirements-stepper`, `ask-user-card`, `hidden`). It never ships code to the browser, because that would be remote code execution in every user session. |
| Access | Hashed bearer tokens with roles reader, agent, publisher, approver, admin. A publisher cannot approve their own work; only approvers pin to uat and prod. |
| Audit | Hash-chained log of every change and denied attempt, with a verify endpoint. Usage rows show which revision, skills and tools each conversation ran. |

The admin console at `/admin` registers and approves skills and tools, edits profile revisions, pins them per environment, and shows usage and the audit log. Buttons are hidden by role, but the server enforces every rule.

**Verified.** 30 automated security checks pass (roles, two-person approval, immutability, signing, revoked items not served, MCP entry limits, size caps, audit tamper detection, atomic audit writes and file access). A browser test ran the full flow: alice published 1.1.0, her approval was refused, bob approved, a new profile was pinned to dev, a new chat picked up v1.1.0 without a restart, and after bob revoked 1.0.0 an open chat re-pinned and finished.

**Prototype versus production.**

- SQLite is single-writer; use Postgres.
- The signing key is a file; use KMS or HSM.
- Tokens are static; use OIDC or workload identity.
- Per-user entitlements (`scope` on a pin) are not enforced.
- The profile's model field is informational; the agent's model is set in code.
- No load test was run, so the scalability claim rests on the design (stateless services, cached resolves, content-addressed skills), not on measurement.
- The `write_todos` tool needs `TodoListMiddleware` on the installed deepagents version; check yours.
