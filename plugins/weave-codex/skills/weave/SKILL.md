---
name: weave
description: "Use when the user wants Codex to operate through Weave-generated agents, workflows, or adapter materialization conventions."
---

<!-- weave-managed -->

# Weave

Use the generated Codex custom agents under `.codex/agents/` for specialized Weave roles.
Treat this skill as the repo-local entrypoint for Weave-aware coordination in Codex.

When delegating, prefer the generated agent whose description best matches the task.
The smoke runtime surfaces prove Codex can load Weave plugin hooks, MCP, and app metadata.
When the user asks to run a Weave workflow from the shell, use `weave codex run-workflow <workflow> --goal <text>` from the repository root.
Use `--codex-global` only when the user explicitly asks to enable global Codex plugin configuration.
