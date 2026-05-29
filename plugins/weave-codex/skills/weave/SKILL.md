---
name: weave
description: "Use when the user wants Codex to operate through Weave-generated agents, workflows, or adapter materialization conventions."
---

# Weave

Use the generated Codex custom agents under `.codex/agents/` for specialized Weave roles.
Treat this skill as the repo-local entrypoint for Weave-aware coordination in Codex.

When delegating, prefer the generated agent whose description best matches the task.
The smoke runtime surfaces prove Codex can load Weave plugin hooks, MCP, and app metadata.
Do not assume full Weave workflow dispatch is available unless a later adapter slice documents it.
