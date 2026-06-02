# Dependency Graph

## Most Imported Files (change these carefully)

- `packages/cli/src/theme/colors.ts` — imported by **15** files
- `packages/cli/src/io/terminal.ts` — imported by **13** files
- `packages/cli/src/fs/file-system.ts` — imported by **11** files
- `packages/engine/src/runtime/errors.ts` — imported by **11** files
- `packages/adapters/opencode/src/sdk-types.ts` — imported by **9** files
- `packages/cli/src/args.ts` — imported by **9** files
- `packages/adapters/codex/src/filesystem.ts` — imported by **8** files
- `packages/core/src/tokens.ts` — imported by **8** files
- `packages/engine/src/compose.ts` — imported by **8** files
- `packages/core/src/errors.ts` — imported by **6** files
- `packages/cli/src/errors.ts` — imported by **6** files
- `packages/engine/src/logger.ts` — imported by **6** files
- `packages/adapters/codex/src/adapter.ts` — imported by **5** files
- `packages/adapters/codex/src/path-utils.ts` — imported by **5** files
- `packages/adapters/codex/src/index.ts` — imported by **5** files
- `packages/adapters/opencode/src/index.ts` — imported by **5** files
- `packages/core/src/lexer.ts` — imported by **5** files
- `packages/cli/src/prompt/index.ts` — imported by **5** files
- `packages/cli/src/cli.ts` — imported by **5** files
- `packages/cli/src/theme/render.ts` — imported by **5** files

## Import Map (who imports what)

- `packages/cli/src/theme/colors.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`, `packages/cli/src/commands/__tests__/migrate.test.ts`, `packages/cli/src/commands/__tests__/validate.test.ts` +10 more
- `packages/cli/src/io/terminal.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`, `packages/cli/src/commands/__tests__/migrate.test.ts`, `packages/cli/src/commands/__tests__/validate.test.ts` +8 more
- `packages/cli/src/fs/file-system.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`, `packages/cli/src/commands/__tests__/migrate.test.ts`, `packages/cli/src/commands/__tests__/codex.test.ts`, `packages/cli/src/commands/__tests__/validate.test.ts` +6 more
- `packages/engine/src/runtime/errors.ts` ← `packages/engine/src/__tests__/runtime-contract.test.ts`, `packages/engine/src/__tests__/runtime-journal.test.ts`, `packages/engine/src/__tests__/runtime-journal.test.ts`, `packages/engine/src/runtime/sanitizer.ts`, `packages/engine/src/runtime/sanitizer.ts` +6 more
- `packages/adapters/opencode/src/sdk-types.ts` ← `packages/adapters/opencode/src/__tests__/run-workflow.test.ts`, `packages/adapters/opencode/src/__tests__/reconcile-agent.test.ts`, `packages/adapters/opencode/src/__tests__/adapter.test.ts`, `packages/adapters/opencode/src/__tests__/plugin.test.ts`, `packages/adapters/opencode/src/adapter.ts` +4 more
- `packages/cli/src/args.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/cli/src/commands/__tests__/codex.test.ts`, `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/codex.ts` +4 more
- `packages/adapters/codex/src/filesystem.ts` ← `packages/adapters/codex/src/index.ts`, `packages/adapters/codex/src/adapter.ts`, `packages/adapters/codex/src/materialize-project.ts`, `packages/adapters/codex/src/artifact-inventory.ts`, `packages/adapters/codex/src/package-artifact.ts` +3 more
- `packages/core/src/tokens.ts` ← `packages/core/src/index.ts`, `packages/core/src/index.ts`, `packages/core/src/__tests__/lexer.test.ts`, `packages/core/src/lexer.ts`, `packages/core/src/ast.ts` +3 more
- `packages/engine/src/compose.ts` ← `packages/engine/src/index.ts`, `packages/engine/src/__tests__/mock-adapter.ts`, `packages/engine/src/__tests__/template-context.test.ts`, `packages/engine/src/__tests__/compose.test.ts`, `packages/engine/src/adapter.ts` +3 more
- `packages/core/src/errors.ts` ← `packages/core/src/index.ts`, `packages/core/src/__tests__/errors.test.ts`, `packages/core/src/lexer.ts`, `packages/core/src/validate.ts`, `packages/core/src/parse-config.ts` +1 more
