# @weave/adapter-codex

Codex adapter for Weave.

This adapter materializes Weave configuration into Codex project-local files and can execute Weave workflows through the shared engine runtime:

- `.codex/agents/*.toml` for generated custom agents
- `plugins/weave-codex/` for the repo-local plugin bundle
- `.agents/plugins/marketplace.json` for the local plugin marketplace entry

The plugin bundle includes smokeable hooks, MCP, and app metadata so Codex can
load the generated runtime surfaces and execute the packaged smoke scripts
during `weave codex smoke`. Current Codex `exec` builds may require fallback
execution for hook and MCP proof.
Workflow persistence, step dispatch, and sanitized adapter journal events are
provided by `runCodexWorkflow()` and `weave codex run-workflow`. Token usage
reporting and public plugin publishing are intentionally deferred.

## Programmatic Usage

```ts
import {
  CodexAdapter,
  materializeCodexProject,
  runCodexWorkflow,
} from "@weave/adapter-codex";

await materializeCodexProject({ projectRoot: Bun.env.PWD ?? "." });

const adapter = new CodexAdapter({ projectRoot: Bun.env.PWD ?? "." });
await adapter.init();
await runCodexWorkflow({
  config,
  workflowName: "quick-fix",
  goal: "Fix the failing login test",
  slug: "fix-login",
  adapter,
});
```

## Verification

```bash
bun test packages/adapters/codex/src
bun run --filter @weave/adapter-codex typecheck
bun run --filter @weave/adapter-codex build
```

See [docs/codex-adapter.md](../../../docs/codex-adapter.md) for the full adapter guide.
