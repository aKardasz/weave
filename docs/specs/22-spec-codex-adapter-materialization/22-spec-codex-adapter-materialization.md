# 22-spec-codex-adapter-materialization.md

## Overview

Create `@weave/adapter-codex`, a first-slice adapter that materializes Weave agents and workflow affordances into Codex project files with smokeable Codex plugin runtime stubs.

The adapter writes Codex custom agents, a repo-local Codex plugin, and a plugin marketplace entry. It preserves the engine/adapter boundary by consuming `AgentDescriptor` values from `materializeAgents()` and keeping Codex-specific discovery and file writing inside the adapter.

## Goals

- Materialize Weave agents into `.codex/agents/*.toml`.
- Generate a repo-local `plugins/weave-codex` plugin with a `$weave` skill.
- Generate smokeable hook, MCP, and app metadata files in the plugin.
- Generate or update `.agents/plugins/marketplace.json` without removing unrelated entries.
- Protect foreign files from accidental overwrite with a `weave-managed` marker.
- Add CLI detection and installer support for Codex.
- Add `weave codex smoke` and explicit `--codex-global` enablement.
- Document first-slice limits clearly.

## Functional Requirements

- The adapter shall implement `HarnessAdapter`.
- `init()` shall create a `BunFilesystemPlanStateProvider` and materialize plugin files.
- `spawnSubagent()` shall translate one `AgentDescriptor` into a managed Codex TOML file.
- `loadAvailableSkills()` shall return injected skills when provided, otherwise discover Codex-visible generated skill metadata.
- Generated files shall include `weave-managed`.
- Existing foreign generated-file paths shall fail closed unless `force` is enabled.
- CLI detection shall include the `codex` binary and `~/.codex/config.toml`.
- The CLI installer shall write only project-local Codex artifacts unless `--codex-global` is set.
- `renderPluginManifest()` shall include `skills`, `mcpServers`, `apps`, and `hooks`.
- The generated hook manifest shall register `SessionStart` and `UserPromptSubmit`.
- The generated MCP config shall expose a `weave-smoke` stdio server with a stable `weave_smoke` tool.
- The generated app manifest shall map `weave-smoke` to static app metadata.
- `--codex-global` shall copy/write managed plugin files under `~/.codex/plugins/weave-codex`, merge `~/.agents/plugins/marketplace.json` using Codex's `source`/`policy` marketplace shape, back up `~/.codex/config.toml`, enable hooks, plugin hooks, plugins, and apps, and append a marker-bounded plugin enablement plus MCP policy block.
- `weave codex smoke` shall preflight `codex --version`, return `CodexCliUnavailable` for the known missing optional dependency error, materialize an isolated project, run `codex exec`, and verify generated agent, marketplace, hook proof, MCP output, and app metadata.

## Non-Goals

- No workflow persistence or step dispatch.
- No public plugin publishing.
- No mutation of root `AGENTS.md`.
- No stale file pruning.
- No new dependencies.
- No automatic global Codex mutation without `--codex-global`.

## Tests

- Adapter translation tests for TOML rendering, policy guidance, and safe file names.
- Plugin rendering tests for manifest, `$weave` skill, and marketplace merge behavior.
- Runtime rendering tests for hook JSON, MCP config/script, and app metadata.
- Adapter tests for init, managed writes, managed updates, foreign-file collision, and injected skills.
- Global enablement tests for managed home writes, backup creation, config merge, and collision behavior.
- Skill discovery tests for repo-local generated skill metadata.
- Materialization tests for `loadConfig()` plus `materializeAgents()` plus Codex writes.
- CLI tests for Codex detection, installer behavior, `--codex-global`, and mocked smoke success/unavailable paths.

## Acceptance Criteria

- `bun test packages/adapters/codex/src` passes.
- `bun test packages/cli/src packages/adapters/codex/src` passes.
- `bun run typecheck` passes.
- `bun run build` passes.
- Documentation is linked from existing adapter docs.
- Manual live smoke is available after local Codex CLI repair: `bun run build && bun packages/cli/src/main.ts codex smoke --codex-global`.
