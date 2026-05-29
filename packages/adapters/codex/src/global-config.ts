import { join } from "node:path";
import {
  errAsync,
  okAsync,
  type ResultAsync as ResultAsyncType,
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
} from "./render-plugin.js";

const GLOBAL_BLOCK_START = "# weave-managed:codex-global:start";
const GLOBAL_BLOCK_END = "# weave-managed:codex-global:end";

export type GlobalCodexEnablementError =
  | { type: "CodexFileSystemError"; error: CodexFileSystemError }
  | { type: "ForeignFileCollision"; path: string; message: string };

export type GlobalCodexEnablementResult = {
  changed: boolean;
  backupPath: string | undefined;
  writtenPaths: string[];
};

export function enableGlobalCodexPlugin(input: {
  fs: CodexFileSystem;
  force?: boolean;
  timestamp?: string;
}): ResultAsyncType<GlobalCodexEnablementResult, GlobalCodexEnablementError> {
  const timestamp =
    input.timestamp ?? new Date().toISOString().replace(/[:.]/g, "-");
  const home = input.fs.home();
  const globalPluginRoot = join(
    home,
    ".codex/plugins",
    WEAVE_CODEX_PLUGIN_NAME,
  );
  const globalMarketplacePath = join(home, CODEX_MARKETPLACE_PATH);
  const globalConfigPath = join(home, ".codex/config.toml");
  const backupPath = `${globalConfigPath}.weave-${timestamp}.bak`;
  const writtenPaths: string[] = [];

  return writeGlobalPluginFiles(
    input.fs,
    globalPluginRoot,
    input.force ?? false,
  )
    .map((paths) => writtenPaths.push(...paths))
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
    .map((configResult) => {
      writtenPaths.push(globalConfigPath);
      if (configResult.backupPath !== undefined) {
        writtenPaths.push(configResult.backupPath);
      }
      return {
        changed: true,
        backupPath: configResult.backupPath,
        writtenPaths,
      };
    });
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
            pluginSourcePath: "./.codex/plugins/weave-codex",
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
              pluginSourcePath: "./.codex/plugins/weave-codex",
            }),
            force: input.force,
          }).map(() => input.path),
        );
    });
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
