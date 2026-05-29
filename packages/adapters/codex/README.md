# @weave/adapter-codex

Codex adapter for Weave.

This adapter materializes Weave configuration into Codex project-local files:

- `.codex/agents/*.toml` for generated custom agents
- `plugins/weave-codex/` for the repo-local plugin bundle
- `.agents/plugins/marketplace.json` for the local plugin marketplace entry

The plugin bundle includes smokeable hooks, MCP, and app metadata so Codex can
load and execute the generated runtime surfaces during `weave codex smoke`.
Workflow persistence, step dispatch, event logging, token usage reporting, and
public plugin publishing are intentionally deferred.

## Programmatic Usage

```ts
import { materializeCodexProject } from "@weave/adapter-codex";

await materializeCodexProject({ projectRoot: Bun.env.PWD ?? "." });
```

## Verification

```bash
bun test packages/adapters/codex/src
bun run --filter @weave/adapter-codex typecheck
bun run --filter @weave/adapter-codex build
```

See [docs/codex-adapter.md](../../../docs/codex-adapter.md) for the full adapter guide.
