# 22-spec-codex-adapter-materialization.md

## Overview

Create `@weave/adapter-codex`, an adapter that materializes Weave agents and workflow affordances into Codex project files, executes Weave workflows through the shared engine runtime, and keeps Codex plugin hook/MCP/app packaging smokeable.

The adapter writes Codex custom agents, a repo-local Codex plugin, and a plugin marketplace entry. It preserves the engine/adapter boundary by consuming `AgentDescriptor` values from `materializeAgents()` and keeping Codex-specific discovery and file writing inside the adapter.

## Goals

- Materialize Weave agents into `.codex/agents/*.toml`.
- Generate a repo-local `plugins/weave-codex` plugin with a `$weave` skill.
- Generate Codex skill interface metadata at `skills/weave/agents/openai.yaml`.
- Generate smokeable hook, MCP, and app metadata files in the plugin.
- Generate or update `.agents/plugins/marketplace.json` without removing unrelated entries.
- Protect foreign files from accidental overwrite with a `weave-managed` marker.
- Add CLI detection and installer support for Codex.
- Add `weave codex smoke` and explicit `--codex-global` enablement.
- Add `weave codex install` and `weave codex run-workflow`.
- Add `weave codex install --dry-run`, `--prune-generated`, and `weave codex package-artifact`.
- Document native Codex runtime limits clearly.

## Functional Requirements

- The adapter shall implement `HarnessAdapter`.
- `init()` shall create a `BunFilesystemPlanStateProvider` and materialize plugin files.
- `spawnSubagent()` shall translate one `AgentDescriptor` into a managed Codex TOML file.
- `loadAvailableSkills()` shall return injected skills when provided, otherwise discover Codex-visible skill metadata from project, parent, home, and generated plugin skill paths.
- Generated files shall include `weave-managed`.
- Existing foreign generated-file paths shall fail closed unless `force` is enabled.
- CLI detection shall include the `codex` binary and `~/.codex/config.toml`.
- The CLI installer shall write only project-local Codex artifacts unless `--codex-global` is set.
- `renderPluginManifest()` shall include `skills`, `mcpServers`, and `apps`; it shall not include unsupported hook path fields.
- The generated root `hooks.json` manifest shall register `SessionStart`, `UserPromptSubmit`, `SubagentStart`, and `SubagentStop`, with `hooks/hooks.json` retained as a compatibility copy.
- The generated `skills/weave/agents/openai.yaml` file shall be treated as Codex skill/interface metadata, not as an executable custom-agent role definition.
- The generated MCP config shall expose a `weave-smoke` stdio server with a stable `weave_smoke` tool.
- The generated app manifest shall map `weave-smoke` to static app metadata.
- `--codex-global` shall copy/write managed plugin files under `~/plugins/weave-codex`, sync generated Weave agent TOMLs into `~/.codex/agents`, merge `~/.agents/plugins/marketplace.json` using Codex's `source`/`policy` marketplace shape, back up `~/.codex/config.toml` and `~/.codex/hooks.json`, enable hooks, plugin hooks, plugins, and apps, append a marker-bounded plugin enablement plus MCP policy block, and merge marker-managed global smoke hook commands that no-op unless `WEAVE_CODEX_SMOKE_PROOF` is present.
- `weave codex smoke` shall preflight `codex --version`, return `CodexCliUnavailable` for the known missing optional dependency error, materialize an isolated project, reinstall `weave-codex@personal` when `--codex-global` is set, run `codex exec`, and verify generated agent, marketplace, hook proof, MCP output, and app metadata. The hook proof shall be written under `.weave/weave-smoke-hooks.jsonl` because current `codex exec` sandboxes can treat `.codex/` as read-only.
- When current Codex `exec` builds do not fire plugin lifecycle hooks or mount plugin MCP tools directly, the smoke prompt may execute the generated hook script once inside the Codex turn and call the packaged MCP server over JSON-RPC as a fallback proof of executable runtime packaging.
- The adapter shall export `runCodexWorkflow`, `CodexWorkflowRunner`, `CodexWorkflowRunnerOptions`, `CodexWorkflowRunResult`, and `CodexWorkflowRuntimeError`.
- `runCodexWorkflow()` shall drive the engine lifecycle with `startExecution`, `dispatchStep`, and `completeStep`.
- Each `dispatch-agent` lifecycle effect shall probe whether `codex exec` exposes a native custom-agent selector. If no selector is available, execution shall stop with `NativeAgentExecutionUnavailable` before launching Codex.
- When a selector is available, each step shall call `CodexAdapter.spawnSubagent()` for the effect's `AgentDescriptor`, render the workflow step prompt without journaling it, and invoke `codex exec --json` with the dispatched agent selected natively.
- Successful `codex exec` exits shall complete the step with `outcome: "success"`; nonzero exits or launch failures shall complete the step with `outcome: "failed"` and a sanitized message.
- `review_verdict` steps shall read explicit approval booleans from parsed Codex JSON events. Missing approval shall fail closed with `approved: false`.
- Codex workflow runs shall persist workflow state through the injected `RuntimeStore`, defaulting to an in-memory store for library callers when no store is supplied.
- Codex workflow runs shall append sanitized adapter Runtime Journal entries for workflow start, step dispatch, agent execution, step completion, and terminal status. Journal data shall include event counts and token totals when Codex JSON events provide them; it shall not include raw step prompts, raw Codex stdout/stderr, unrestricted transcripts, or credentials.
- `weave codex install` shall materialize project-local agents, plugin files, and the marketplace entry without running Codex. `--dry-run` shall report stale generated artifacts without deletion. `--prune-generated` shall delete only stale owned generated artifacts, never foreign files.
- `weave codex package-artifact` shall write a publishable plugin artifact bundle and marketplace metadata without pushing to an external marketplace.
- `weave codex run-workflow <workflow> --goal <text>` shall load Weave config, materialize Codex project files, optionally sync those agents globally when `--codex-global` is set, use `.weave/runtime/weave.db` as the default Runtime Store, and execute the selected workflow through `runCodexWorkflow()`.

## Non-Goals

- No external marketplace push; package artifact generation is supported.
- No mutation of root `AGENTS.md`.
- No automatic stale file pruning; pruning is opt-in via `--prune-generated`.
- No new dependencies.
- No automatic global Codex mutation without `--codex-global`.
- No raw native Codex transcript ingestion.
- Token usage reporting is best-effort from `codex exec --json` events.

## Tests

- Adapter translation tests for TOML rendering, policy guidance, and safe file names.
- Plugin rendering tests for manifest, `$weave` skill, and marketplace merge behavior.
- Runtime rendering tests for hook JSON, skill interface metadata, MCP config/script, and app metadata.
- Adapter tests for init, managed writes, managed updates, foreign-file collision, and injected skills.
- Global enablement tests for managed home writes, global agent TOML sync, backup creation, config merge, and collision behavior.
- Skill discovery tests for broad Codex-visible skill metadata and dedupe.
- Artifact inventory tests for collision detection, stale reporting, and opt-in pruning.
- Package artifact tests for generated bundle shape.
- Native capability probe tests for supported and unsupported custom-agent selectors.
- JSON event parser tests for usage, verdict approval, usage-unavailable, and malformed JSON.
- Materialization tests for `loadConfig()` plus `materializeAgents()` plus Codex writes.
- CLI tests for Codex detection, installer behavior, `--codex-global`, and mocked smoke success/unavailable paths.
- Runtime tests for `runCodexWorkflow()` success, failed Codex execution, missing workflow, max-step guard, agent TOML writes, native capability blocking, review verdicts, and Runtime Journal entries.
- Step executor tests for native custom-agent selector invocation, rendered prompt handoff, nonzero exit handling, JSON event parsing, and raw stdout/stderr exclusion from journal data.
- CLI tests for `codex install`, `--dry-run`, `--prune-generated`, `package-artifact`, `codex run-workflow`, required `--goal`, `--max-steps`, and injected Runtime Store behavior.

## Acceptance Criteria

- `bun test packages/adapters/codex/src` passes.
- `bun test packages/cli/src packages/adapters/codex/src` passes.
- `bun run typecheck` passes.
- `bun run build` passes.
- Documentation is linked from existing adapter docs.
- Manual live smoke is available after local Codex CLI repair: `bun run build && bun packages/cli/src/main.ts codex smoke --codex-global`.
