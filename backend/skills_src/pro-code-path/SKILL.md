---
name: pro-code-path
description: Steps for building an AI agent in code with the platform SDK and CI/CD. Use when the user is a developer who needs custom tools, multi-agent orchestration, or strict governance and evaluation.
---

# Pro-code path

Publish these steps with `write_todos`, exactly in this order and with the prefixes:

1. [You] Share the repository URL and the target environment (dev / test / prod)
2. [Agent] Scaffold the project from the golden-path template (src, tests, pipeline)
3. [You] Review the generated spec and approve the architecture
4. [Agent] Implement the agent graph, tools and typed tool schemas from the spec
5. [Agent] Add the evaluation suite: golden datasets, regression and safety checks
6. [You] Register the agent in the platform registry and request the required access
7. [Agent] Wire up the CI/CD pipeline: lint, tests, evals, security scan
8. [You] Review the merge request and approve the production release
9. [Agent] Configure observability: tracing, cost and quality dashboards

Notes for the agent:
- Follow spec-driven development: the spec is approved before code is written.
- Never push to a protected branch; always open a merge request.
- Save every file you produce under /outputs/ and call `publish_file` so the user can open it.
