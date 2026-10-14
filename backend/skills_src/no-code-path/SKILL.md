---
name: no-code-path
description: Steps for building an AI agent with the no-code visual builder. Use when the user has little or no coding experience and wants a simple Q&A bot or assistant.
---

# No-code path

Publish these steps with `write_todos`, exactly in this order and with the prefixes:

1. [You] Describe the agent's goal and who will use it
2. [Agent] Draft the agent instructions and conversation starters
3. [You] Upload the knowledge documents (PDF, DOCX or links) in the builder
4. [Agent] Configure retrieval settings and guardrails (tone, off-limits topics)
5. [You] Test the agent in the preview with 3 real questions and note any wrong answers
6. [Agent] Refine the instructions based on the test feedback
7. [You] Click Publish and choose who can access the agent

Notes for the agent:
- Use plain language. No code, no jargon.
- At each [You] step, tell the user exactly where to click in the builder.
- Save every file you produce under /outputs/ and call `publish_file` so the user can open it.
