# Codex Adapter

> **Status**: Materialization adapter with Codex-backed workflow step execution and smokeable Codex plugin stubs.

**Related:** [Adapter Boundary](adapter-boundary.md) · [Adapter Readiness Status](adapter-readiness-status.md) · [Harness Agent Surface Patterns](harness-agent-surface-patterns.md) · [ADR 0004](adr/0004-codex-adapter-materialization-shape.md) · [Spec 22](specs/22-spec-codex-adapter-materialization/22-spec-codex-adapter-materialization.md)

## Summary

`@weave/adapter-codex` materializes Weave intent into Codex project files. It is a hybrid adapter:

- Weave agents become Codex custom agents in `.codex/agents/*.toml`.
- The reusable Weave entrypoint becomes a repo-local Codex plugin skill under `plugins/weave-codex/skills/weave/`.
- The plugin is advertised through `.agents/plugins/marketplace.json`.
- The plugin includes smokeable hook, MCP, and app metadata surfaces so live Codex loading can be tested.
- `runCodexWorkflow()` drives the shared engine lifecycle and executes each dispatched step through `codex exec`.

Codex uses three separate surfaces here: executable custom agents are standalone TOML files under `.codex/agents/`, plugin skills can expose UI metadata such as `skills/weave/agents/openai.yaml`, and hooks observe lifecycle events such as session and subagent start/stop. The adapter keeps executable agents file-based instead of hiding agents inside the plugin bundle because current Codex plugin manifests do not register executable custom-agent roles.

## Generated Files

The adapter writes these project-local files:

```text
.codex/agents/<agent>.toml
plugins/weave-codex/.codex-plugin/plugin.json
plugins/weave-codex/skills/weave/SKILL.md
plugins/weave-codex/skills/weave/agents/openai.yaml
plugins/weave-codex/hooks.json
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

The generated plugin manifest points to `skills`, `.mcp.json`, and `.app.json`. The Weave skill also includes `skills/weave/agents/openai.yaml`, which Codex treats as skill/interface metadata rather than an executable custom-agent definition. Hook registration is written to root `hooks.json`, matching the current Codex plugin ingestion shape; `hooks/hooks.json` is also generated as a compatibility copy for older first-slice artifacts.

- `hooks.json` registers `SessionStart`, `UserPromptSubmit`, `SubagentStart`, and `SubagentStop` command hooks. The hook script reads Codex hook JSON from stdin and appends proof to `${PLUGIN_DATA}/weave-smoke-hooks.jsonl`. During automated smoke runs, `WEAVE_CODEX_SMOKE_PROOF` writes proof under the isolated temp repo's `.weave/weave-smoke-hooks.jsonl`; `.codex/` is avoided because current `codex exec` sandboxes can treat it as read-only.
- `.mcp.json` registers a stdio MCP server named `weave-smoke`. Its single tool, `weave_smoke`, returns plugin/root/session metadata without touching project files.
- `.app.json` maps `weave-smoke` to static app metadata. This proves app packaging and visibility, not full non-interactive app UI execution.

Normal users still rely on Codex hook trust review. The smoke command uses `--dangerously-bypass-hook-trust` only in an isolated generated temp repo. Current Codex `exec` builds may not fire plugin lifecycle hooks or mount plugin MCP tools directly, so the smoke prompt also executes the generated hook script once inside the Codex turn and falls back to JSON-RPC against the packaged MCP server when the native `weave_smoke` tool is not exposed.

## Global Enablement

Default installation is repo-local only. `--codex-global` is the only path that mutates Codex home state. It writes the personal plugin to `~/plugins/weave-codex`, syncs the generated Weave agent TOMLs into `~/.codex/agents`, merges `~/.agents/plugins/marketplace.json` using Codex's current `source`/`policy` marketplace shape, creates timestamped backups of `~/.codex/config.toml` and `~/.codex/hooks.json`, enables `features.hooks`, `features.plugin_hooks`, `features.plugins`, and `features.apps`, appends a marker-bounded plugin enablement plus MCP policy block for `plugins."weave-codex".mcp_servers.weave-smoke`, and merges marker-managed global smoke hook commands without removing unrelated hooks. The global smoke hook commands no-op unless `WEAVE_CODEX_SMOKE_PROOF` is present.

## Smoke Command

```bash
bun packages/cli/src/main.ts codex smoke --codex-global
```

The command preflights `codex --version`, materializes a temp project, optionally enables global Codex plugin config and global agent TOML sync, reinstalls the personal plugin with `codex plugin add weave-codex@personal`, then runs `codex exec` with hooks, plugin hooks, plugins, and apps enabled. Success verifies the generated agent, repo marketplace, hook proof in `.weave/weave-smoke-hooks.jsonl`, MCP output mentioning `weave_smoke`, and app metadata. In WSL, `codex` must resolve to a Linux-native binary such as `/usr/local/bin/codex`, not a Windows npm shim under `/mnt/c/...`. If the local Codex binary fails with `Missing optional dependency @openai/codex-linux-x64`, reinstall Codex with:

```bash
sudo npm install -g @openai/codex@latest
hash -r
command -v codex
codex --version
```

## Workflow Runtime

Codex workflow execution is available through the adapter API and CLI:

```bash
weave codex install
weave codex install --dry-run
weave codex install --prune-generated
weave codex package-artifact --output dist/codex-plugin
weave codex run-workflow quick-fix --goal "Fix the failing login test"
```

`weave codex install` materializes repo-local Codex agents, the `weave-codex` plugin, and the marketplace entry without starting Codex. `--dry-run` reports stale generated artifacts without deleting them. `--prune-generated` deletes only stale owned generated artifacts; foreign files are reported as collisions and preserved. `weave codex package-artifact` writes a publishable plugin bundle and marketplace metadata without pushing to an external marketplace.

`weave codex run-workflow` loads `.weave/config.weave`, materializes Codex files, creates or opens `.weave/runtime/weave.db`, and drives the selected workflow with the engine lifecycle (`startExecution`, `dispatchStep`, `completeStep`). With `--codex-global`, the same materialized agent TOMLs are also synced to `~/.codex/agents` before workflow execution. Each dispatched step writes the target Codex agent TOML through `CodexAdapter.spawnSubagent()`, renders the step prompt without journaling it, probes for a native `codex exec` custom-agent selector, invokes `codex exec --json` with the dispatched agent selected natively, and completes the step from parsed JSON events plus the process exit. If the current Codex CLI does not expose a native non-interactive custom-agent selector, workflow execution fails before launching the step with `NativeAgentExecutionUnavailable`.

The runtime appends sanitized adapter journal entries such as `codex.workflow.started`, `codex.workflow.step.dispatched`, `codex.agent.executed`, `codex.workflow.completed`, and `codex.workflow.failed`. It records step status, exit code, JSON event counts, and token totals when Codex emits usage events. It does not journal raw prompts, unrestricted transcripts, raw stderr/stdout content, or credentials.

Nonzero `codex exec` exits complete the current workflow step with `outcome: "failed"` and terminate the workflow as failed. `review_verdict` steps parse explicit `approved: true | false` booleans from Codex JSON events; missing approval fails closed with `approved: false`.

Library callers can use:

```ts
import {
  CodexWorkflowRunner,
  runCodexWorkflow,
} from "@weave/adapter-codex";
```

The default CLI runtime store is the shared project-local `.weave/runtime/weave.db`. Tests and library callers can inject any `RuntimeStore`.

## Current Limits

The adapter still intentionally does not implement:

- external marketplace push for public plugin publishing
- raw native Codex transcript ingestion
- guaranteed token usage reporting when Codex JSON events omit usage

The generated hook/MCP/app files remain smoke stubs for Codex plugin packaging. Workflow state is driven by Weave's engine lifecycle rather than undocumented Codex-native workflow APIs; individual steps are executed through the public `codex exec` command.
