import { join } from "node:path";
import {
  err,
  errAsync,
  ok,
  okAsync,
  Result,
  type ResultAsync as ResultAsyncType,
  type Result as ResultType,
} from "neverthrow";
import {
  CODEX_MARKETPLACE_PATH,
  CODEX_SMOKE_MCP_SERVER_NAME,
  CODEX_SMOKE_MCP_TOOL_NAME,
  WEAVE_CODEX_PLUGIN_NAME,
  WEAVE_GENERATED_BY,
  WEAVE_MANAGED_MARKER,
} from "./constants.js";
import type { CodexFileSystem, CodexFileSystemError } from "./filesystem.js";
import { safeCodexFileStem } from "./path-utils.js";
import {
  renderAppManifest,
  renderHookManifest,
  renderMarketplace,
  renderMcpConfig,
  renderPluginManifest,
  renderSmokeApp,
  renderSmokeHookScript,
  renderSmokeMcpScript,
  renderWeaveSkill,
  renderWeaveSkillOpenAiMetadata,
} from "./render-plugin.js";

const GLOBAL_BLOCK_START = "# weave-managed:codex-global:start";
const GLOBAL_BLOCK_END = "# weave-managed:codex-global:end";
const GLOBAL_HOOK_MARKER = "weave-managed:codex-smoke-global-hook";
const GLOBAL_HOOK_CHAIN_SEPARATOR = " || true; ";

export type GlobalCodexEnablementError =
  | { type: "CodexFileSystemError"; error: CodexFileSystemError }
  | { type: "InvalidGlobalHooksJson"; path: string; message: string }
  | { type: "ForeignFileCollision"; path: string; message: string };

export type GlobalCodexEnablementResult = {
  changed: boolean;
  backupPath: string | undefined;
  writtenPaths: string[];
  globalAgentCount: number;
  globalAgentPaths: string[];
};

export type GlobalCodexAgentArtifact = {
  name: string;
  content: string;
};

export function enableGlobalCodexPlugin(input: {
  fs: CodexFileSystem;
  force?: boolean;
  agentArtifacts?: readonly GlobalCodexAgentArtifact[];
  smokeProofPath?: string;
  timestamp?: string;
}): ResultAsyncType<GlobalCodexEnablementResult, GlobalCodexEnablementError> {
  const timestamp =
    input.timestamp ?? new Date().toISOString().replace(/[:.]/g, "-");
  const home = input.fs.home();
  const globalPluginRoot = join(home, "plugins", WEAVE_CODEX_PLUGIN_NAME);
  const globalMarketplacePath = join(home, CODEX_MARKETPLACE_PATH);
  const globalConfigPath = join(home, ".codex/config.toml");
  const globalHooksPath = join(home, ".codex/hooks.json");
  const backupPath = `${globalConfigPath}.weave-${timestamp}.bak`;
  const hooksBackupPath = `${globalHooksPath}.weave-${timestamp}.bak`;
  const writtenPaths: string[] = [];
  const globalAgentPaths: string[] = [];

  return writeGlobalPluginFiles(
    input.fs,
    globalPluginRoot,
    input.force ?? false,
  )
    .map((paths) => writtenPaths.push(...paths))
    .andThen(() =>
      syncGlobalCodexAgents({
        fs: input.fs,
        force: input.force ?? false,
        agents: input.agentArtifacts ?? [],
      }),
    )
    .map((syncResult) => {
      writtenPaths.push(...syncResult.writtenPaths);
      globalAgentPaths.push(...syncResult.writtenPaths);
      return syncResult;
    })
    .andThen(() =>
      writeGlobalMarketplace({
        fs: input.fs,
        path: globalMarketplacePath,
        force: input.force ?? false,
      }),
    )
    .map((path) => writtenPaths.push(path))
    .andThen(() =>
      writeGlobalConfig({
        fs: input.fs,
        configPath: globalConfigPath,
        backupPath,
      }),
    )
    .andThen((configResult) =>
      writeGlobalSmokeHooks({
        fs: input.fs,
        hooksPath: globalHooksPath,
        backupPath: hooksBackupPath,
        pluginRoot: globalPluginRoot,
        smokeProofPath: input.smokeProofPath,
      }).map((hooksResult) => ({ configResult, hooksResult })),
    )
    .map(({ configResult, hooksResult }) => {
      writtenPaths.push(globalConfigPath);
      if (configResult.backupPath !== undefined) {
        writtenPaths.push(configResult.backupPath);
      }
      writtenPaths.push(globalHooksPath);
      if (hooksResult.backupPath !== undefined) {
        writtenPaths.push(hooksResult.backupPath);
      }
      return {
        changed: true,
        backupPath: configResult.backupPath,
        writtenPaths,
        globalAgentCount: globalAgentPaths.length,
        globalAgentPaths,
      };
    });
}

export function syncGlobalCodexAgents(input: {
  fs: CodexFileSystem;
  force?: boolean;
  agents: readonly GlobalCodexAgentArtifact[];
}): ResultAsyncType<{ writtenPaths: string[] }, GlobalCodexEnablementError> {
  const globalAgentsRoot = join(input.fs.home(), ".codex/agents");
  let chain = okAsync<string[], GlobalCodexEnablementError>([]);

  for (const agent of input.agents) {
    const path = join(
      globalAgentsRoot,
      `${safeCodexFileStem(agent.name)}.toml`,
    );
    chain = chain.andThen((paths) =>
      writeManagedGlobalFile({
        fs: input.fs,
        path,
        content: agent.content,
        force: input.force ?? false,
      }).map(() => [...paths, path]),
    );
  }

  return chain.map((writtenPaths) => ({ writtenPaths }));
}

function writeGlobalPluginFiles(
  fs: CodexFileSystem,
  pluginRoot: string,
  force: boolean,
): ResultAsyncType<string[], GlobalCodexEnablementError> {
  const files: Array<{ path: string; content: string }> = [
    {
      path: join(pluginRoot, ".codex-plugin/plugin.json"),
      content: renderPluginManifest(),
    },
    {
      path: join(pluginRoot, "skills/weave/SKILL.md"),
      content: renderWeaveSkill(),
    },
    {
      path: join(pluginRoot, "skills/weave/agents/openai.yaml"),
      content: renderWeaveSkillOpenAiMetadata(),
    },
    {
      path: join(pluginRoot, "hooks.json"),
      content: renderHookManifest(),
    },
    {
      path: join(pluginRoot, "hooks/hooks.json"),
      content: renderHookManifest(),
    },
    {
      path: join(pluginRoot, "hooks/weave-smoke-hook.ts"),
      content: renderSmokeHookScript(),
    },
    {
      path: join(pluginRoot, ".mcp.json"),
      content: renderMcpConfig(),
    },
    {
      path: join(pluginRoot, "mcp/weave-smoke-mcp.ts"),
      content: renderSmokeMcpScript(),
    },
    {
      path: join(pluginRoot, ".app.json"),
      content: renderAppManifest(),
    },
    {
      path: join(pluginRoot, "apps/weave-smoke-app.json"),
      content: renderSmokeApp(),
    },
    {
      path: join(pluginRoot, "assets/.gitkeep"),
      content: `# ${WEAVE_MANAGED_MARKER}\n`,
    },
  ];

  let chain = okAsync<string[], GlobalCodexEnablementError>([]);
  for (const file of files) {
    chain = chain.andThen((paths) =>
      writeManagedGlobalFile({
        fs,
        path: file.path,
        content: file.content,
        force,
      }).map(() => [...paths, file.path]),
    );
  }
  return chain;
}

function writeGlobalMarketplace(input: {
  fs: CodexFileSystem;
  path: string;
  force: boolean;
}): ResultAsyncType<string, GlobalCodexEnablementError> {
  return input.fs
    .exists(input.path)
    .mapErr(toGlobalFsError)
    .andThen((exists) => {
      if (!exists) {
        return writeManagedGlobalFile({
          fs: input.fs,
          path: input.path,
          content: renderMarketplace(undefined, {
            marketplaceName: "personal",
            marketplaceDisplayName: "Personal",
            pluginSourcePath: "./plugins/weave-codex",
          }),
          force: input.force,
        }).map(() => input.path);
      }

      return input.fs
        .readText(input.path)
        .mapErr(toGlobalFsError)
        .andThen((content) =>
          writeManagedGlobalFile({
            fs: input.fs,
            path: input.path,
            content: renderMarketplace(content, {
              marketplaceName: "personal",
              marketplaceDisplayName: "Personal",
              pluginSourcePath: "./plugins/weave-codex",
            }),
            force: input.force,
          }).map(() => input.path),
        );
    });
}

function writeGlobalSmokeHooks(input: {
  fs: CodexFileSystem;
  hooksPath: string;
  backupPath: string;
  pluginRoot: string;
  smokeProofPath: string | undefined;
}): ResultAsyncType<
  { backupPath: string | undefined },
  GlobalCodexEnablementError
> {
  return input.fs
    .exists(input.hooksPath)
    .mapErr(toGlobalFsError)
    .andThen((exists) => {
      if (!exists) {
        const rendered = renderGlobalSmokeHooks(
          undefined,
          input.pluginRoot,
          input.smokeProofPath,
          input.hooksPath,
        );
        if (rendered.isErr()) return errAsync(rendered.error);
        return input.fs
          .writeText(input.hooksPath, rendered.value)
          .mapErr(toGlobalFsError)
          .map(() => ({ backupPath: undefined }));
      }

      return input.fs
        .readText(input.hooksPath)
        .mapErr(toGlobalFsError)
        .andThen((existing) => {
          const rendered = renderGlobalSmokeHooks(
            existing,
            input.pluginRoot,
            input.smokeProofPath,
            input.hooksPath,
          );
          if (rendered.isErr()) return errAsync(rendered.error);
          return input.fs
            .writeText(input.backupPath, existing)
            .mapErr(toGlobalFsError)
            .andThen(() =>
              input.fs
                .writeText(input.hooksPath, rendered.value)
                .mapErr(toGlobalFsError),
            )
            .map(() => ({ backupPath: input.backupPath }));
        });
    });
}

type CodexHooksFile = {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
};

function renderGlobalSmokeHooks(
  content: string | undefined,
  pluginRoot: string,
  smokeProofPath: string | undefined,
  path: string,
): ResultType<string, GlobalCodexEnablementError> {
  const parsed = parseGlobalHooks(content, path);
  if (parsed.isErr()) return err(parsed.error);

  const hooksFile = parsed.value;
  const hooks = hooksFile.hooks;
  if (hooks === undefined) {
    hooksFile.hooks = {};
  } else if (!isRecord(hooks)) {
    return err({
      type: "InvalidGlobalHooksJson",
      path,
      message: "Expected top-level hooks to be an object.",
    });
  }

  const merged = hooksFile.hooks ?? {};
  merged.SessionStart = mergeHookEvent(
    merged.SessionStart,
    createGlobalSmokeHookEntry(
      pluginRoot,
      smokeProofPath,
      "Recording Weave smoke hook",
    ),
    path,
  );
  if (merged.SessionStart instanceof Error) {
    return err({
      type: "InvalidGlobalHooksJson",
      path,
      message: merged.SessionStart.message,
    });
  }

  merged.UserPromptSubmit = mergeHookEvent(
    merged.UserPromptSubmit,
    createGlobalSmokeHookEntry(
      pluginRoot,
      smokeProofPath,
      "Recording Weave prompt smoke hook",
    ),
    path,
  );
  if (merged.UserPromptSubmit instanceof Error) {
    return err({
      type: "InvalidGlobalHooksJson",
      path,
      message: merged.UserPromptSubmit.message,
    });
  }

  merged.SubagentStart = mergeHookEvent(
    merged.SubagentStart,
    createGlobalSmokeHookEntry(
      pluginRoot,
      smokeProofPath,
      "Recording Weave subagent start smoke hook",
    ),
    path,
  );
  if (merged.SubagentStart instanceof Error) {
    return err({
      type: "InvalidGlobalHooksJson",
      path,
      message: merged.SubagentStart.message,
    });
  }

  merged.SubagentStop = mergeHookEvent(
    merged.SubagentStop,
    createGlobalSmokeHookEntry(
      pluginRoot,
      smokeProofPath,
      "Recording Weave subagent stop smoke hook",
    ),
    path,
  );
  if (merged.SubagentStop instanceof Error) {
    return err({
      type: "InvalidGlobalHooksJson",
      path,
      message: merged.SubagentStop.message,
    });
  }

  hooksFile.hooks = merged;
  hooksFile.metadata = mergeMetadata(hooksFile.metadata);

  return ok(`${JSON.stringify(hooksFile, null, 2)}\n`);
}

function parseGlobalHooks(
  content: string | undefined,
  path: string,
): ResultType<CodexHooksFile, GlobalCodexEnablementError> {
  if (content === undefined || content.trim().length === 0) {
    return ok({ hooks: {} });
  }

  const parsed = Result.fromThrowable(
    () => JSON.parse(content) as unknown,
    (cause): GlobalCodexEnablementError => ({
      type: "InvalidGlobalHooksJson",
      path,
      message: cause instanceof Error ? cause.message : String(cause),
    }),
  )();
  if (parsed.isErr()) return err(parsed.error);
  if (!isRecord(parsed.value)) {
    return err({
      type: "InvalidGlobalHooksJson",
      path,
      message: "Expected hook file to contain a JSON object.",
    });
  }

  return ok(parsed.value as CodexHooksFile);
}

type GlobalHookCommand = {
  type: "command";
  command: string;
  statusMessage: string;
};

type GlobalHookEntry = {
  hooks: GlobalHookCommand[];
};

function createGlobalSmokeHookEntry(
  pluginRoot: string,
  smokeProofPath: string | undefined,
  statusMessage: string,
): GlobalHookEntry {
  const hookScript = join(pluginRoot, "hooks/weave-smoke-hook.ts");
  const proofEnv =
    smokeProofPath === undefined
      ? []
      : [`WEAVE_CODEX_SMOKE_PROOF=${shellQuote(smokeProofPath)}`];
  return {
    hooks: [
      {
        type: "command",
        command: [
          "env",
          "WEAVE_CODEX_SMOKE_GLOBAL_FALLBACK=weave-managed",
          `WEAVE_CODEX_SMOKE_GLOBAL_HOOK_MARKER=${GLOBAL_HOOK_MARKER}`,
          ...proofEnv,
          `PLUGIN_ROOT=${shellQuote(pluginRoot)}`,
          "bun",
          "run",
          shellQuote(hookScript),
        ].join(" "),
        statusMessage: `${statusMessage} (${GLOBAL_HOOK_MARKER})`,
      },
    ],
  };
}

function mergeHookEvent(
  existing: unknown,
  entry: GlobalHookEntry,
  path: string,
): unknown[] | Error {
  if (existing === undefined) return [entry];
  if (!Array.isArray(existing)) {
    return new Error(`Expected hook event entries in ${path} to be an array.`);
  }

  const filtered = existing.filter(
    (candidate) => !isManagedOnlyGlobalHook(candidate),
  );
  let appended = false;
  const merged = filtered.map((candidate) => {
    if (!isRecord(candidate)) return candidate;
    if (!Array.isArray(candidate.hooks)) return candidate;

    const hookIndex = candidate.hooks.findIndex(isCommandHook);
    if (hookIndex === -1) return candidate;

    appended = true;
    const hooks = candidate.hooks.filter(
      (hook) => !isStandaloneManagedGlobalHookCommand(hook),
    );
    const commandHook = hooks[hookIndex];
    if (!isCommandHook(commandHook)) return candidate;

    const nextHooks = [...hooks];
    nextHooks[hookIndex] = chainSmokeHookCommand(commandHook, entry.hooks[0]);
    return {
      ...candidate,
      hooks: nextHooks,
    };
  });

  if (appended) return merged;
  return [...merged, entry];
}

function isManagedOnlyGlobalHook(candidate: unknown): boolean {
  if (!isRecord(candidate)) return false;
  const hooks = candidate.hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.length > 0 && hooks.every(isStandaloneManagedGlobalHookCommand);
}

function isStandaloneManagedGlobalHookCommand(candidate: unknown): boolean {
  if (!isRecord(candidate)) return false;
  const command = String(candidate.command ?? "");
  if (!command.includes(GLOBAL_HOOK_MARKER)) return false;
  return !command.includes(GLOBAL_HOOK_CHAIN_SEPARATOR);
}

function isCommandHook(candidate: unknown): candidate is GlobalHookCommand {
  if (!isRecord(candidate)) return false;
  return (
    candidate.type === "command" &&
    typeof candidate.command === "string" &&
    typeof candidate.statusMessage !== "object"
  );
}

function chainSmokeHookCommand(
  existing: GlobalHookCommand,
  smoke: GlobalHookCommand,
): GlobalHookCommand {
  const originalCommand = originalHookCommand(existing.command);
  return {
    ...existing,
    command: `${smoke.command}${GLOBAL_HOOK_CHAIN_SEPARATOR}${originalCommand}`,
  };
}

function originalHookCommand(command: string): string {
  if (!command.includes(GLOBAL_HOOK_MARKER)) return command;

  const separatorIndex = command.indexOf(GLOBAL_HOOK_CHAIN_SEPARATOR);
  if (separatorIndex === -1) return command;
  return command.slice(separatorIndex + GLOBAL_HOOK_CHAIN_SEPARATOR.length);
}

function mergeMetadata(metadata: unknown): Record<string, unknown> {
  if (!isRecord(metadata)) {
    return { generatedBy: WEAVE_GENERATED_BY, ownership: WEAVE_MANAGED_MARKER };
  }

  return {
    ...metadata,
    generatedBy: WEAVE_GENERATED_BY,
    ownership: WEAVE_MANAGED_MARKER,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function writeGlobalConfig(input: {
  fs: CodexFileSystem;
  configPath: string;
  backupPath: string;
}): ResultAsyncType<
  { backupPath: string | undefined },
  GlobalCodexEnablementError
> {
  return input.fs
    .exists(input.configPath)
    .mapErr(toGlobalFsError)
    .andThen((exists) => {
      if (!exists) {
        const content = appendGlobalBlock("");
        return input.fs
          .writeText(input.configPath, content)
          .mapErr(toGlobalFsError)
          .map(() => ({ backupPath: undefined }));
      }

      return input.fs
        .readText(input.configPath)
        .mapErr(toGlobalFsError)
        .andThen((existing) =>
          input.fs
            .writeText(input.backupPath, existing)
            .mapErr(toGlobalFsError)
            .andThen(() =>
              input.fs
                .writeText(input.configPath, appendGlobalBlock(existing))
                .mapErr(toGlobalFsError),
            )
            .map(() => ({ backupPath: input.backupPath })),
        );
    });
}

function appendGlobalBlock(content: string): string {
  const withoutExisting = removeManagedBlock(content).trimEnd();
  const prefix = ["hooks", "plugin_hooks", "plugins", "apps"].reduce(
    (current, feature) => updateFeatureFlag(current, feature),
    withoutExisting,
  );
  const separator = prefix.trim().length > 0 ? "\n\n" : "";
  return `${prefix}${separator}${renderGlobalBlock()}\n`;
}

function removeManagedBlock(content: string): string {
  const start = content.indexOf(GLOBAL_BLOCK_START);
  const end = content.indexOf(GLOBAL_BLOCK_END);
  if (start === -1 || end === -1 || end < start) return content;

  const afterEnd = end + GLOBAL_BLOCK_END.length;
  return `${content.slice(0, start)}${content.slice(afterEnd)}`;
}

function updateFeatureFlag(content: string, feature: string): string {
  const lines = content.split("\n");
  let inFeatures = false;
  let sawFeatures = false;
  let sawFeature = false;
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (inFeatures && !sawFeature) output.push(`${feature} = true`);
      inFeatures = trimmed === "[features]";
      if (inFeatures) sawFeatures = true;
    }

    if (inFeatures && trimmed.startsWith(`${feature} =`)) {
      output.push(`${feature} = true`);
      sawFeature = true;
      continue;
    }

    output.push(line);
  }

  if (inFeatures && !sawFeature) output.push(`${feature} = true`);
  if (!sawFeatures) {
    if (output.join("\n").trim().length > 0) output.push("");
    output.push("[features]");
    output.push(`${feature} = true`);
  }

  return output.join("\n");
}

function renderGlobalBlock(): string {
  return [
    GLOBAL_BLOCK_START,
    `# Generated by ${WEAVE_GENERATED_BY}. Remove this block to disable Weave Codex smoke MCP policy.`,
    `[plugins."${WEAVE_CODEX_PLUGIN_NAME}"]`,
    "enabled = true",
    "",
    `[plugins."${WEAVE_CODEX_PLUGIN_NAME}".mcp_servers.${CODEX_SMOKE_MCP_SERVER_NAME}]`,
    "enabled = true",
    'default_tools_approval_mode = "approve"',
    `enabled_tools = ["${CODEX_SMOKE_MCP_TOOL_NAME}"]`,
    GLOBAL_BLOCK_END,
  ].join("\n");
}

function writeManagedGlobalFile(input: {
  fs: CodexFileSystem;
  path: string;
  content: string;
  force: boolean;
}): ResultAsyncType<void, GlobalCodexEnablementError> {
  return input.fs
    .exists(input.path)
    .mapErr(toGlobalFsError)
    .andThen((exists) => {
      if (!exists || input.force) {
        return input.fs
          .writeText(input.path, input.content)
          .mapErr(toGlobalFsError);
      }

      return input.fs
        .readText(input.path)
        .mapErr(toGlobalFsError)
        .andThen((existing) => {
          if (existing.includes(WEAVE_MANAGED_MARKER)) {
            return input.fs
              .writeText(input.path, input.content)
              .mapErr(toGlobalFsError);
          }

          return errAsync<void, GlobalCodexEnablementError>({
            type: "ForeignFileCollision",
            path: input.fs.resolvePath(input.path),
            message: `Refusing to overwrite ${input.fs.resolvePath(input.path)} because it is not marked as Weave-managed.`,
          });
        });
    });
}

function toGlobalFsError(
  error: CodexFileSystemError,
): GlobalCodexEnablementError {
  return { type: "CodexFileSystemError", error };
}
