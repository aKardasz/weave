# Codex Adapter

> **Status**: First-slice materialization adapter with smokeable runtime stubs.

**Related:** [Adapter Boundary](adapter-boundary.md) · [Adapter Readiness Status](adapter-readiness-status.md) · [Harness Agent Surface Patterns](harness-agent-surface-patterns.md) · [ADR 0004](adr/0004-codex-adapter-materialization-shape.md) · [Spec 22](specs/22-spec-codex-adapter-materialization/22-spec-codex-adapter-materialization.md)

## Summary

`@weave/adapter-codex` materializes Weave intent into Codex project files. It is a hybrid adapter:

- Weave agents become Codex custom agents in `.codex/agents/*.toml`.
- The reusable Weave entrypoint becomes a repo-local Codex plugin under `plugins/weave-codex/`.
- The plugin is advertised through `.agents/plugins/marketplace.json`.
- The plugin includes smokeable hook, MCP, and app metadata surfaces so live Codex loading can be tested.

Codex plugins are the distribution surface for reusable skills, hooks, MCP servers, apps, and assets. Codex custom agents are still standalone TOML files under `.codex/agents/`, so this adapter keeps agent materialization file-based instead of hiding agents inside the plugin bundle.

## Generated Files

The adapter writes these project-local files:

```text
.codex/agents/<agent>.toml
plugins/weave-codex/.codex-plugin/plugin.json
plugins/weave-codex/skills/weave/SKILL.md
plugins/weave-codex/hooks/hooks.json
plugins/weave-codex/hooks/weave-smoke-hook.ts
plugins/weave-codex/.mcp.json
plugins/weave-codex/mcp/weave-smoke-mcp.ts
plugins/weave-codex/.app.json
plugins/weave-codex/apps/weave-smoke-app.json
plugins/weave-codex/assets/.gitkeep
.agents/plugins/marketplace.json
```

Generated files include a `weave-managed` marker. The adapter overwrites existing Weave-managed files, but refuses to overwrite foreign files unless `force` is enabled.

## Agent Translation

Each `AgentDescriptor` from `@weave/engine` maps to one Codex custom agent:

| Weave descriptor field | Codex TOML field |
| --- | --- |
| `name` | `name` |
| `description` | `description` |
| `displayName` | `nickname_candidates` |
| `composedPrompt` | `developer_instructions` |
| resolved model intent | `model` |
| denied write or execute policy | `sandbox_mode = "read-only"` |

Weave `tool_policy` is also rendered into `developer_instructions` as behavioral guidance. Codex runtime permissions still come from the active Codex session and any agent-specific sandbox setting.

## Skill Discovery

The adapter owns Codex skill discovery and returns `SkillInfo[]` to the engine. It checks the documented Codex skill locations for the generated `weave` skill and preserves path/description data in adapter-owned metadata. The engine still matches only by `SkillInfo.name`.

## Runtime Smoke Surfaces

The generated plugin manifest points to `skills`, `.mcp.json`, `.app.json`, and `hooks/hooks.json`.

- `hooks/hooks.json` registers `SessionStart` and `UserPromptSubmit` command hooks. The hook script reads Codex hook JSON from stdin and appends proof to `${PLUGIN_DATA}/weave-smoke-hooks.jsonl`. During automated smoke runs, `WEAVE_CODEX_SMOKE_PROOF` mirrors that proof into the isolated temp repo.
- `.mcp.json` registers a stdio MCP server named `weave-smoke`. Its single tool, `weave_smoke`, returns plugin/root/session metadata without touching project files.
- `.app.json` maps `weave-smoke` to static app metadata. This proves app packaging and visibility, not full non-interactive app UI execution.

Normal users still rely on Codex hook trust review. The smoke command uses `--dangerously-bypass-hook-trust` only in an isolated generated temp repo.

## Global Enablement

Default installation is repo-local only. `--codex-global` is the only path that mutates Codex home state. It writes the plugin to `~/.codex/plugins/weave-codex`, merges `~/.agents/plugins/marketplace.json` using Codex's current `source`/`policy` marketplace shape, creates a timestamped backup of `~/.codex/config.toml`, enables `features.hooks`, `features.plugin_hooks`, `features.plugins`, and `features.apps`, and appends a marker-bounded plugin enablement plus MCP policy block for `plugins."weave-codex".mcp_servers.weave-smoke`.

## Smoke Command

```bash
bun packages/cli/src/main.ts codex smoke --codex-global
```

The command preflights `codex --version`, materializes a temp project, optionally enables global Codex plugin config, then runs `codex exec` with hooks, plugin hooks, plugins, and apps enabled. If the local Codex binary fails with `Missing optional dependency @openai/codex-linux-x64`, reinstall Codex with:

```bash
npm install -g @openai/codex@latest
```

## Current Limits

This first slice intentionally does not implement:

- workflow persistence
- workflow step dispatch
- event logging or token usage reporting
- public plugin publishing
- stale generated file pruning

Those capabilities require a separate runtime integration design. The current runtime files are smoke stubs that prove Codex can load and execute plugin hooks/MCP/app metadata; they do not dispatch real Weave workflows yet.
