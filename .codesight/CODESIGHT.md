# @weave — AI Context Map

> **Stack:** raw-http | none | unknown | typescript
> **Monorepo:** @weave/core, @weave/engine, @weave/config, @weave/cli, @weave/adapter-codex, @weave/adapter-opencode

> 0 routes | 0 models | 0 components | 73 lib files | 10 env vars | 2 middleware | 0% test coverage
> **Token savings:** this file is ~6,100 tokens. Without it, AI exploration would cost ~29,900 tokens. **Saves ~23,800 tokens per conversation.**
> **Last scanned:** 2026-05-29 22:34 — re-run after significant changes

---

# Libraries

- `packages/adapters/codex/src/capability-contract.ts` — function buildCodexCapabilityContract: () => AdapterCapabilityContract
- `packages/adapters/codex/src/filesystem.ts`
  - class BunCodexFileSystem
  - class MemoryCodexFileSystem
  - interface CodexFileSystem
  - type CodexFileSystemError
- `packages/adapters/codex/src/adapter.ts`
  - class CodexAdapterError
  - class CodexAdapter
  - interface CodexAdapterOptions
  - type CodexAdapterErrorType
- `packages/adapters/codex/src/materialize-project.ts`
  - function materializeCodexProject: (input, "projectRoot">;
  fileReader?) => ResultAsyncType<
  - type MaterializeCodexProjectError
  - type MaterializeCodexProjectResult
- `packages/adapters/codex/src/render-plugin.ts`
  - function renderPluginManifest: () => string
  - function renderWeaveSkill: () => string
  - function renderHookManifest: () => string
  - function renderSmokeHookScript: () => string
  - function renderMcpConfig: () => string
  - function renderSmokeMcpScript: () => string
  - _...7 more_
- `packages/adapters/codex/src/skill-discovery.ts` — function discoverCodexSkills: (input) => ResultAsync<SkillInfo[], SkillDiscoveryError>, type SkillDiscoveryError
- `packages/adapters/codex/src/render-agent.ts`
  - function translateAgent: (descriptor, resolvedModel?) => Result<CodexAgentConfig, TranslateAgentError>
  - function renderAgentToml: (config) => string
  - type CodexAgentConfig
  - type TranslateAgentError
- `packages/adapters/codex/src/model-resolution.ts` — function resolveCodexModelForAgent: (descriptor, context) => string | undefined, interface CodexModelContext
- `packages/adapters/codex/src/global-config.ts`
  - function enableGlobalCodexPlugin: (input) => ResultAsyncType<GlobalCodexEnablementResult, GlobalCodexEnablementError>
  - type GlobalCodexEnablementError
  - type GlobalCodexEnablementResult
- `packages/adapters/codex/src/ownership.ts` — function writeManagedFile: (input) => ResultAsync<void, ManagedWriteError>, type ManagedWriteError
- `packages/adapters/codex/src/path-utils.ts` — function safeCodexFileStem: (name) => string
- `packages/adapters/opencode/src/run-workflow.ts`
  - function runWorkflow: (input) => ResultAsync<RunWorkflowResult, RunWorkflowError>
  - interface RunWorkflowInput
  - interface RunWorkflowResult
  - type RunWorkflowError
- `packages/adapters/opencode/src/adapter.ts`
  - class OpenCodeAdapterError
  - class OpenCodeAdapter
  - interface OpenCodeAdapterOptions
- `packages/adapters/opencode/src/reconcile-agent.ts`
  - function classifyExistingAgent: (agentName, existingAgents) => ReconcileDecision
  - function tagWithOwnership: (config) => OpenCodeAgentConfig
  - function reconcileAgent: (agentName, config, client) => ResultAsync<void, ReconcileAgentError>
  - type ReconcileAgentError
  - type ReconcileDecision
  - const WEAVE_OWNERSHIP_TAG
- `packages/adapters/opencode/src/tool-policy-mapping.ts`
  - function toOpenCodePermission: (permission) => OpenCodePermissionValue
  - function buildReadToolsEntry: (readPermission) => Record<string, boolean> | undefined
  - function mapToolPolicy: (policy) => void
  - type OpenCodePermissionValue
  - type OpenCodeToolPermissions
  - const READ_TOOL_NAMES: readonly string[]
- `packages/adapters/opencode/src/translate-agent.ts` — function translateAgent: (descriptor, resolvedModel?) => Result<OpenCodeAgentConfig, TranslateAgentError>, type TranslateAgentError
- `packages/adapters/opencode/src/skill-discovery.ts`
  - function buildSkillInfoList: (names) => SkillInfo[]
  - function validateDeclaredSkills: (declaredSkills, availableSkills, disabledSkills) => Result<void, MissingSkillsError>
  - interface MissingSkillsError
- `packages/adapters/opencode/src/model-resolution.ts`
  - function resolveModelForAgent: (descriptor, context) => Result<string, ModelResolutionError>
  - interface OpenCodeModelContext
  - type ModelResolutionError
- `packages/adapters/opencode/src/plugin.ts`
  - function createWeavePlugin: (options) => Plugin
  - interface WeavePluginOptions
  - const WeavePlugin: Plugin
  - const server
- `packages/adapters/opencode/src/opencode-client.ts`
  - class SdkOpenCodeClient
  - interface OpenCodeClientFacade
  - type OpenCodeClientError
- `packages/core/src/lexer.ts` — function tokenize: (source) => Result<Token[], LexError[]>
- `packages/core/src/validate.ts` — function validate: (ast) => Result<WeaveConfig, ValidationError[]>
- `packages/core/src/parse-config.ts` — function parseConfig: (source) => Result<WeaveConfig, ConfigError[]>
- `packages/core/src/errors.ts`
  - function formatError: (error) => string
  - type LexError
  - type ParseError
  - type ValidationError
  - type ConfigError
- `packages/core/src/parser.ts` — function parse: (tokens) => Result<AstNode[], ParseError[]>
- `packages/cli/src/commands/init.ts`
  - function convertLegacyJsonc: (source) => ConversionResult
  - function runInit: (ctx) => Promise<Result<number, CliError>>
  - function writeMigratedDsl: (fs, plan, dslContent, destExists) => ResultAsync<
  - interface InitContext
  - type MigrationPlan
  - type ConversionWarning
  - _...1 more_
- `packages/cli/src/commands/codex.ts`
  - function runCodex: (ctx) => Promise<Result<number, CliError>>
  - function runCodexSmoke: (input) => ResultAsync<CodexSmokeResult, CodexSmokeError>
  - interface CodexContext
  - type CodexSmokeError
  - type CodexSmokeResult
- `packages/cli/src/commands/validate.ts` — function runValidate: (ctx) => Promise<Result<number, CliError>>, interface ValidateContext
- `packages/cli/src/commands/runtime.ts` — function runRuntime: (ctx) => Promise<Result<number, CliError>>, interface RuntimeCommandContext
- `packages/cli/src/args.ts`
  - function parseArgs: (argv) => Result<ParsedArgs, ArgParseError>
  - interface ParsedArgs
  - type Command
  - type ArgParseError
- `packages/cli/src/cli.ts` — function run: (deps?) => Promise<Result<number, CliError>>, interface CliDeps
- `packages/cli/src/config/starter-config.ts` — function starterConfig: (scope) => string
- `packages/cli/src/theme/colors.ts`
  - class ThemeManager
  - interface ThemeColors
  - interface ThemeManagerDeps
  - const defaultThemeManager
- `packages/cli/src/theme/render.ts`
  - class ThemeRenderer
  - interface VersionSource
  - const defaultThemeRenderer
- `packages/cli/src/theme/ascii-logo.ts`
  - function renderLogo: (theme) => string[]
  - const PLAIN_LOGO_LINES: string[]
  - const LOGO_WIDTH
- `packages/cli/src/io/terminal.ts`
  - class RealTerminal
  - class BufferTerminal
  - interface TerminalIO
- `packages/cli/src/installers/index.ts`
  - function installerRegistry: (fs) => Record<SupportedHarnessId, HarnessInstaller>
  - function installAllSupported: (input, string[]>;
}) => ResultAsync<InstallResult[], InstallError>
  - interface HarnessInstaller
  - type AdapterModule
  - type InstallRequest
  - type InstallResult
  - _...1 more_
- `packages/cli/src/installers/codex.ts` — class CodexInstaller
- `packages/cli/src/installers/opencode.ts` — class OpenCodeInstaller
- `packages/cli/src/errors.ts`
  - function formatCliError: (error) => string
  - type CliError
  - type InvalidArgsError
  - type MissingFileError
  - type FileReadError
  - type ParseFailureError
  - _...2 more_
- `packages/cli/src/prompt/index.ts`
  - class ClackPromptAdapter
  - class StaticPromptAdapter
  - interface PromptAdapter
  - type PromptError
  - type PromptOption
- `packages/cli/src/detect/index.ts`
  - function detectHarnesses: (probes) => void
  - function formatDetectionSummary: (harnesses) => string[]
  - type SupportedHarnessId
  - type DetectedHarness
  - type DetectionError
- `packages/cli/src/detect/probes.ts`
  - class BunDetectionProbes
  - class MemoryDetectionProbes
  - interface DetectionProbes
  - type ProbeError
- `packages/cli/src/fs/file-system.ts`
  - function describeFileSystemError: (error) => string
  - class BunFileSystem
  - class MemoryFileSystem
  - interface FileSystem
  - type FileSystemError
- `packages/cli/src/process/runner.ts`
  - class BunProcessRunner
  - interface ProcessRunner
  - type ProcessRunResult
  - type ProcessRunError
- `packages/config/src/loader.ts` — function loadConfig: (projectRoot?, fileReader) => ResultAsync<import("@weave/core").WeaveConfig, ConfigLoadError[]>
- `packages/config/src/builtins.ts`
  - function getBuiltinConfig: () => Result<WeaveConfig, ConfigError[]>
  - const BUILTIN_PROMPT_CONTENTS: Readonly<Record<string, string>>
  - const BUILTIN_WEAVE_SOURCE
- `packages/config/src/normalize-path.ts` — function normalizePath: (p) => string
- `packages/config/src/plan-state-provider.ts` — class BunFilesystemPlanStateProvider
- `packages/config/src/merge.ts`
  - function mergeWorkflow: (workflowName, base, override, workflowMap, WorkflowConfig>) => Result<WorkflowConfig, WorkflowExtensionError>
  - function mergeConfigsResult: (...configs) => Result<WeaveConfig, MergeError[]>
  - function mergeConfigs: (...configs) => WeaveConfig
  - type WorkflowExtensionError
  - type MergeError
- `packages/config/src/resolve.ts` — function resolvePromptPaths: (config, scope) => WeaveConfig
- `packages/config/src/discovery.ts`
  - function discoverAndParse: (projectRoot?, fileReader) => ResultAsync<DiscoveredConfig[], ConfigLoadError[]>
  - interface FileReader
  - type DiscoveredConfig
  - const bunFileReader: FileReader
- `packages/engine/src/capability-contract.ts`
  - function evaluateCoreReadinessProfile: (contract) => ProfileEvaluationResult
  - function buildAdapterHealthReport: (input) => AdapterHealthReport
  - function buildHumanRows: (report) => HumanReadinessRow[]
  - function buildToonRows: (report) => ToonReadinessRow[]
  - function toJson: (report) => string
  - interface CapabilityEntry
  - _...18 more_
- `packages/engine/src/env.ts`
  - function parseEnv: (raw, string | undefined>) => Result<Env, EnvValidationError>
  - type Env
  - type EnvValidationError
  - const envSchema
  - const env: Env
- `packages/engine/src/runtime/types.ts`
  - function createWorkflowInstanceId: (raw) => WorkflowInstanceId
  - function createExecutionLeaseId: (raw) => ExecutionLeaseId
  - function createSessionSnapshotId: (raw) => SessionSnapshotId
  - function createRuntimeJournalEntryId: (raw) => RuntimeJournalEntryId
  - function createOwnerId: (raw) => OwnerId
  - interface JsonObject
  - _...18 more_
- `packages/engine/src/runtime/sanitizer.ts` — function sanitizeJournalData: (data) => Result<JsonObject, RuntimeStoreError>, function sanitizeSnapshotMetadata: (metadata, string | number | boolean>) => Result<Record<string, string | number | boolean>, RuntimeStoreError>
- `packages/engine/src/runtime/fingerprint.ts` — function createProjectSalt: () => string, function fingerprintContent: (salt, content) => ResultAsync<string, RuntimeStoreError>
- `packages/engine/src/runtime/memory-store.ts`
  - function createInMemoryRuntimeStore: (options) => InMemoryRuntimeStore
  - class InMemoryRuntimeStore
  - interface InMemoryRuntimeStoreFailureConfig
  - interface InMemoryRuntimeStoreOptions
- `packages/engine/src/runtime/errors.ts`
  - function initializationError: (message, cause?) => RuntimeStoreInitializationError
  - function migrationVersionError: (foundVersion, supportedVersion, message) => RuntimeStoreMigrationVersionError
  - function serializationError: (message, cause?) => RuntimeStoreSerializationError
  - function queryError: (message, cause?) => RuntimeStoreQueryError
  - function notFoundError: (entity, id, message?) => RuntimeStoreNotFoundError
  - function conflictError: (entity, message, conflictingId?) => RuntimeStoreConflictError
  - _...11 more_
- `packages/engine/src/runtime/sqlite/migrations.ts`
  - function runMigrations: (db) => Result<void, RuntimeStoreError>
  - function readSchemaVersion: (db) => number
  - const CURRENT_SCHEMA_VERSION
- `packages/engine/src/runtime/sqlite/kysely-bun-sqlite.ts` — class BunSqliteDialect
- `packages/engine/src/runtime/sqlite/store.ts`
  - function createSqliteRuntimeStore: (options) => SqliteRuntimeStore
  - class SqliteRuntimeStore
  - interface SqliteRuntimeStoreOptions
- `packages/engine/src/runtime/journal-writer.ts` — class RuntimeJournalWriter, interface WriteJournalEntryInput
- `packages/engine/src/descriptors.ts`
  - function generateCategoryShuttles: (config) => Result<
  - interface GeneratedCategoryShuttle
  - type CategoryShuttleConflictError
- `packages/engine/src/execution-lifecycle.ts`
  - function sanitizeMetadata: (metadata) => Result<SafeMetadata, LifecycleValidationError>
  - function lifecycleValidationError: (message, field?) => LifecycleValidationError
  - function lifecycleNotFoundError: (entity, id, message?) => LifecycleNotFoundError
  - function lifecycleLeaseConflictError: (workflowInstanceId, conflictingLeaseId, message) => LifecycleLeaseConflictError
  - function lifecyclePersistenceError: (message, cause?) => LifecyclePersistenceError
  - function lifecyclePolicyDecisionError: (message, rule?) => LifecyclePolicyDecisionError
  - _...41 more_
- `packages/engine/src/template-context.ts`
  - function buildTemplateContext: (input) => Result<AgentPromptTemplateContext, TemplateContextError>
  - interface AgentContextEntry
  - interface CategoryContextEntry
  - interface ToolPolicyContextEntry
  - interface DelegationTargetContextEntry
  - interface DelegationContextEntry
  - _...5 more_
- `packages/engine/src/tool-policy.ts`
  - function evaluateEffectiveToolPolicy: (policy) => EffectiveToolPolicy
  - function resolveToolDecisions: (toolIds, classifications, effectivePolicy) => ToolDecision[]
  - type EffectiveToolPolicy
  - type ConcreteToolClassification
  - type MappedToolDecision
  - type UnmappedToolDecision
  - _...3 more_
- `packages/engine/src/materialization.ts`
  - function materializeAgents: (input) => ResultAsync<MaterializationPlan, never>
  - interface MaterializationInput
  - interface MaterializedAgent
  - interface MaterializationPlan
  - type MaterializationError
- `packages/engine/src/template-renderer.ts`
  - function renderTemplate: (source, context, options) => Result<string, RendererError>
  - function extractTemplatePaths: (source) => Result<string[], RendererError>
  - interface TemplateContext
  - interface RenderOptions
  - type RendererError
- `packages/engine/src/compose.ts`
  - function composeAgentDescriptor: (agentName, agentConfig, config, allAgents, AgentConfig>, category?) => ResultAsync<AgentDescriptor, ComposeError>
  - interface CategoryMetadata
  - interface AgentDescriptor
  - interface AgentDescriptorCategory
  - interface DelegationTarget
  - type PromptTemplateReason
  - _...1 more_
- `packages/engine/src/logger.ts`
  - function redirectLogsToFile: (filePath) => Promise<void>
  - const logDestination
  - const logger
- `packages/engine/src/model-resolution.ts`
  - function resolveAdapterModelIntent: (input) => ModelResolutionResult
  - interface ModelResolutionInput
  - interface ModelResolutionResult
  - type ResolutionSource
  - const DEFAULT_FALLBACK_MODEL
- `packages/engine/src/skill-resolution.ts`
  - function resolveSkillsForAgent: (input) => Result<ResolvedSkill[], SkillResolutionError[]>
  - function resolveSkillsForConfig: (input) => Result<ConfigSkillResolutionResult, SkillResolutionError[]>
  - interface SkillInfo
  - interface ResolvedSkill
  - interface SkillResolutionInput
  - interface SkillResolutionConfigInput
  - _...2 more_

---

# Config

## Environment Variables

- `CLAUDE_PLUGIN_DATA` **required** — packages/adapters/codex/src/render-plugin.ts
- `CLAUDE_PLUGIN_ROOT` **required** — packages/adapters/codex/src/render-plugin.ts
- `CODEX_SESSION_ID` **required** — packages/adapters/codex/src/render-plugin.ts
- `HOME` **required** — packages/adapters/codex/src/filesystem.ts
- `LOG_LEVEL` **required** — packages/config/src/logger.ts
- `PLUGIN_DATA` **required** — packages/adapters/codex/src/render-plugin.ts
- `PLUGIN_ROOT` **required** — packages/adapters/codex/src/render-plugin.ts
- `PWD` **required** — packages/adapters/opencode/src/adapter.ts
- `WEAVE_CODEX_SMOKE_PROOF` **required** — packages/adapters/codex/src/render-plugin.ts
- `WEAVE_LOG_FILE` **required** — packages/engine/src/env.ts

## Config Files

- `tsconfig.json`

---

# Middleware

## custom
- migrate-conversion.test — `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`
- migrate.test — `packages/cli/src/commands/__tests__/migrate.test.ts`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `packages/cli/src/theme/colors.ts` — imported by **15** files
- `packages/cli/src/io/terminal.ts` — imported by **13** files
- `packages/cli/src/fs/file-system.ts` — imported by **11** files
- `packages/engine/src/runtime/errors.ts` — imported by **11** files
- `packages/adapters/opencode/src/sdk-types.ts` — imported by **9** files
- `packages/cli/src/args.ts` — imported by **9** files
- `packages/core/src/tokens.ts` — imported by **8** files
- `packages/engine/src/compose.ts` — imported by **8** files
- `packages/core/src/errors.ts` — imported by **6** files
- `packages/cli/src/errors.ts` — imported by **6** files
- `packages/engine/src/logger.ts` — imported by **6** files
- `packages/adapters/codex/src/filesystem.ts` — imported by **5** files
- `packages/adapters/opencode/src/index.ts` — imported by **5** files
- `packages/core/src/lexer.ts` — imported by **5** files
- `packages/cli/src/prompt/index.ts` — imported by **5** files
- `packages/cli/src/cli.ts` — imported by **5** files
- `packages/cli/src/theme/render.ts` — imported by **5** files
- `packages/config/src/builtins.ts` — imported by **5** files
- `packages/config/src/discovery.ts` — imported by **5** files
- `packages/config/src/merge.ts` — imported by **5** files

## Import Map (who imports what)

- `packages/cli/src/theme/colors.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`, `packages/cli/src/commands/__tests__/migrate.test.ts`, `packages/cli/src/commands/__tests__/validate.test.ts` +10 more
- `packages/cli/src/io/terminal.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`, `packages/cli/src/commands/__tests__/migrate.test.ts`, `packages/cli/src/commands/__tests__/validate.test.ts` +8 more
- `packages/cli/src/fs/file-system.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/migrate-conversion.test.ts`, `packages/cli/src/commands/__tests__/migrate.test.ts`, `packages/cli/src/commands/__tests__/codex.test.ts`, `packages/cli/src/commands/__tests__/validate.test.ts` +6 more
- `packages/engine/src/runtime/errors.ts` ← `packages/engine/src/__tests__/runtime-contract.test.ts`, `packages/engine/src/__tests__/runtime-journal.test.ts`, `packages/engine/src/__tests__/runtime-journal.test.ts`, `packages/engine/src/runtime/sanitizer.ts`, `packages/engine/src/runtime/sanitizer.ts` +6 more
- `packages/adapters/opencode/src/sdk-types.ts` ← `packages/adapters/opencode/src/__tests__/run-workflow.test.ts`, `packages/adapters/opencode/src/__tests__/reconcile-agent.test.ts`, `packages/adapters/opencode/src/__tests__/adapter.test.ts`, `packages/adapters/opencode/src/__tests__/plugin.test.ts`, `packages/adapters/opencode/src/adapter.ts` +4 more
- `packages/cli/src/args.ts` ← `packages/cli/src/commands/__tests__/init.test.ts`, `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/cli/src/commands/__tests__/codex.test.ts`, `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/codex.ts` +4 more
- `packages/core/src/tokens.ts` ← `packages/core/src/index.ts`, `packages/core/src/index.ts`, `packages/core/src/__tests__/lexer.test.ts`, `packages/core/src/lexer.ts`, `packages/core/src/ast.ts` +3 more
- `packages/engine/src/compose.ts` ← `packages/engine/src/index.ts`, `packages/engine/src/__tests__/mock-adapter.ts`, `packages/engine/src/__tests__/template-context.test.ts`, `packages/engine/src/__tests__/compose.test.ts`, `packages/engine/src/adapter.ts` +3 more
- `packages/core/src/errors.ts` ← `packages/core/src/index.ts`, `packages/core/src/__tests__/errors.test.ts`, `packages/core/src/lexer.ts`, `packages/core/src/validate.ts`, `packages/core/src/parse-config.ts` +1 more
- `packages/cli/src/errors.ts` ← `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/codex.ts`, `packages/cli/src/commands/validate.ts`, `packages/cli/src/commands/runtime.ts`, `packages/cli/src/index.ts` +1 more

---

# Test Coverage

> **0%** of routes and models are covered by tests
> 62 test files found

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_