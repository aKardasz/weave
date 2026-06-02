# ADR 0004: Codex Adapter Materialization Shape

**Status**: Accepted, amended for workflow runtime and runtime smoke
**Date**: 2026-05-29
**Related**: [Adapter Boundary](../adapter-boundary.md) · [Codex Adapter](../codex-adapter.md) · [Spec 22](../specs/22-spec-codex-adapter-materialization/22-spec-codex-adapter-materialization.md)

## Context

Codex exposes a different integration shape than OpenCode. OpenCode has a plugin runtime that can inject configuration and reconcile agents through SDK calls. Codex has documented project/user config, `AGENTS.md`, custom agents under `.codex/agents/*.toml`, skills under `.agents/skills`, and plugins that bundle skills, hooks, MCP servers, apps, and assets.

The adapter needed to answer two questions:

1. Should Weave agents be generated as Codex custom agents or bundled inside a Codex plugin?
2. Should Codex workflow execution depend on native Codex runtime hooks or the Weave engine lifecycle?

## Decision

`@weave/adapter-codex` uses a hybrid materialization shape with Weave-owned workflow runtime execution and smokeable Codex plugin stubs.

Weave agents are generated as `.codex/agents/*.toml` because Codex custom agents are standalone TOML files. The generated `developer_instructions` field receives the engine-composed prompt plus Weave tool-policy guidance. The adapter omits unsupported generation preferences such as temperature unless Codex exposes a stable equivalent.

Reusable Weave workflow affordances are packaged as a repo-local Codex plugin at `plugins/weave-codex/`. The plugin contains a `$weave` skill plus smokeable hook, MCP, and app metadata files. The repo-local marketplace entry lives in `.agents/plugins/marketplace.json`.

Workflow execution is driven through the engine lifecycle and Runtime Store, not undocumented Codex-native workflow internals. `runCodexWorkflow()` and `weave codex run-workflow` call `startExecution`, `dispatchStep`, and `completeStep`, apply dispatch effects by materializing the target Codex agent TOML, and append sanitized adapter journal entries. This provides workflow persistence, step dispatch, and event logging parity at the Weave layer while leaving native Codex transcript ingestion and token usage reporting unsupported.

The generated plugin can also prove Codex loads the generated plugin surfaces and executes the packaged hook/MCP smoke scripts through `weave codex smoke`. Current Codex `exec` builds may not fire plugin lifecycle hooks or expose plugin MCP tools as native callables, so the smoke command falls back to running the hook script once inside the Codex turn and invoking the packaged MCP server over JSON-RPC.

Global Codex mutation is explicit only. `--codex-global` copies the plugin into `~/plugins/weave-codex`, merges the personal marketplace using Codex's current `source`/`policy` entry shape, backs up `~/.codex/config.toml` and `~/.codex/hooks.json`, enables required hook/plugin/app feature flags, appends a marker-bounded plugin enablement plus MCP policy block, and merges a marker-managed global smoke hook command that no-ops unless smoke proof output is requested. The plugin manifest intentionally omits a `hooks` field; Codex discovers plugin hook registration from root `hooks.json`.

## Consequences

- The adapter can be implemented and tested entirely with mock filesystem state.
- Engine boundaries remain intact: the engine composes descriptors; the adapter discovers Codex skills and writes Codex files.
- The adapter provides immediate value for Codex users while making live plugin loading smoke-testable.
- Runtime parity is implemented at the Weave engine lifecycle layer. Native Codex hook/MCP/app smoke remains a packaging proof, not the source of workflow truth.
- Global writes are reversible and opt-in; repo-local materialization remains the default.

## Rejected Alternatives

- **Plugin-only agent materialization**: rejected because Codex custom agents are documented as `.codex/agents/*.toml`, while plugins are for reusable workflows and integrations.
- **Mutating `AGENTS.md`**: rejected because repo instructions are human-owned and layered by Codex precedence. The adapter should not rewrite them in v1.
- **Native Codex workflow dispatch as the source of truth**: rejected because current non-interactive Codex plugin surfaces do not provide stable workflow lifecycle guarantees. The adapter uses the engine lifecycle and keeps Codex plugin runtime behavior smoke-tested separately.
