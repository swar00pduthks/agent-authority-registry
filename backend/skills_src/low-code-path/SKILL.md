---
name: low-code-path
description: Steps for building an AI agent with the low-code workflow canvas. Use when the user is comfortable with light scripting or expressions and wants workflow automation or a few custom integrations.
---

# Low-code path

Publish these steps with `write_todos`, exactly in this order and with the prefixes:

1. [You] Describe the workflow trigger and the systems it must touch (email, ticketing, CRM...)
2. [Agent] Sketch the workflow canvas: trigger, agent node, tool nodes, approval node
3. [You] Create the connections and store credentials in the platform vault
4. [Agent] Generate the node configuration and the prompt for the agent node
5. [You] Add a custom expression or small script node where the logic needs it
6. [Agent] Create 5 test cases covering the happy path and two failure modes
7. [You] Run the test cases on the canvas and review the traces
8. [Agent] Summarise the results and list what to fix before release
9. [You] Promote the workflow to production

Notes for the agent:
- Keep any script snippets under 20 lines.
- Point the user to the trace view when something fails.
- Save every file you produce under /outputs/ and call `publish_file` so the user can open it.
