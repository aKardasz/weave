# ADR 0004: Codex Adapter Materialization Shape

**Status**: Accepted, amended for runtime smoke
**Date**: 2026-05-29
**Related**: [Adapter Boundary](../adapter-boundary.md) · [Codex Adapter](../codex-adapter.md) · [Spec 22](../specs/22-spec-codex-adapter-materialization/22-spec-codex-adapter-materialization.md)

## Context

Codex exposes a different integration shape than OpenCode. OpenCode has a plugin runtime that can inject configuration and reconcile agents through SDK calls. Codex has documented project/user config, `AGENTS.md`, custom agents under `.codex/agents/*.toml`, skills under `.agents/skills`, and plugins that bundle skills, hooks, MCP servers, apps, and assets.

The adapter needed to answer two questions:

1. Should Weave agents be generated as Codex custom agents or bundled inside a Codex plugin?
2. Should the first slice claim live workflow/runtime support?

## Decision

`@weave/adapter-codex` uses a hybrid materialization shape with smokeable runtime stubs.

Weave agents are generated as `.codex/agents/*.toml` because Codex custom agents are standalone TOML files. The generated `developer_instructions` field receives the engine-composed prompt plus Weave tool-policy guidance. The adapter omits unsupported generation preferences such as temperature unless Codex exposes a stable equivalent.

Reusable Weave workflow affordances are packaged as a repo-local Codex plugin at `plugins/weave-codex/`. The plugin contains a `$weave` skill plus smokeable hook, MCP, and app metadata files. The repo-local marketplace entry lives in `.agents/plugins/marketplace.json`.

The first slice is not a full Codex workflow runtime adapter. It can prove Codex loads and executes generated hook/MCP/app surfaces through `weave codex smoke`, but it does not dispatch Weave workflow steps, persist workflow state, or report token usage.

Global Codex mutation is explicit only. `--codex-global` copies the plugin into `~/.codex/plugins/weave-codex`, merges the personal marketplace using Codex's current `source`/`policy` entry shape, backs up `~/.codex/config.toml`, enables required hook/plugin/app feature flags, and appends a marker-bounded plugin enablement plus MCP policy block.

## Consequences

- The adapter can be implemented and tested entirely with mock filesystem state.
- Engine boundaries remain intact: the engine composes descriptors; the adapter discovers Codex skills and writes Codex files.
- The adapter provides immediate value for Codex users while making live plugin loading smoke-testable.
- Runtime parity remains explicitly deferred and must be designed as a later capability, not inferred from the smoke hook or MCP server.
- Global writes are reversible and opt-in; repo-local materialization remains the default.

## Rejected Alternatives

- **Plugin-only agent materialization**: rejected because Codex custom agents are documented as `.codex/agents/*.toml`, while plugins are for reusable workflows and integrations.
- **Mutating `AGENTS.md`**: rejected because repo instructions are human-owned and layered by Codex precedence. The adapter should not rewrite them in v1.
- **OpenCode-style runtime parity**: rejected for v1 because smoke hooks/MCP prove loading, not a stable SDK-backed workflow dispatch surface.
