import { dirname, join } from "node:path";
import {
  type CodexFileSystem,
  type CodexFileSystemError,
  enableGlobalCodexPlugin,
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
  WEAVE_MANAGED_MARKER,
} from "@weave/adapter-codex";
import {
  errAsync,
  ResultAsync,
  type ResultAsync as ResultAsyncType,
} from "neverthrow";
import type { FileSystem, FileSystemError } from "../fs/file-system.js";
import type {
  AdapterModule,
  HarnessInstaller,
  InstallError,
  InstallRequest,
  InstallResult,
} from "./index.js";

const CODEX_MODULE_ID = "plugin";

type ManagedWriteCliError =
  | FileSystemError
  | {
      type: "ForeignFileCollision";
      path: string;
      message: string;
    };

export class CodexInstaller implements HarnessInstaller {
  readonly id = "codex" as const;
  readonly supported = true;
  readonly optionalModules: AdapterModule[] = [
    {
      id: CODEX_MODULE_ID,
      label: "Weave Codex plugin",
      description:
        "Install the repo-local Weave Codex plugin and marketplace entry.",
    },
  ];

  constructor(private readonly fs: FileSystem) {}

  install(request: InstallRequest): ResultAsync<InstallResult, InstallError> {
    const projectRoot = this.projectRootFromConfig(request.configPath);
    const messages: string[] = [];

    return this.writeManaged(
      join(projectRoot, "plugins/weave-codex/.codex-plugin/plugin.json"),
      renderPluginManifest(),
      request.force,
    )
      .andThen((changed) => {
        if (changed) messages.push("Installed Codex Weave plugin manifest.");
        return this.writeManaged(
          join(projectRoot, "plugins/weave-codex/skills/weave/SKILL.md"),
          renderWeaveSkill(),
          request.force,
        ).map((skillChanged) => changed || skillChanged);
      })
      .andThen((changed) =>
        this.writeManaged(
          join(
            projectRoot,
            "plugins/weave-codex/skills/weave/agents/openai.yaml",
          ),
          renderWeaveSkillOpenAiMetadata(),
          request.force,
        ).map((metadataChanged) => changed || metadataChanged),
      )
      .andThen((changed) =>
        this.writeRuntimeFiles(projectRoot, request.force).map(
          (runtimeChanged) => {
            if (runtimeChanged) {
              messages.push("Installed Codex runtime smoke files.");
            }
            return changed || runtimeChanged;
          },
        ),
      )
      .andThen((changed) => {
        if (changed) messages.push("Installed Codex Weave skill.");
        return this.writeMarketplace(projectRoot, request.force).map(
          (marketplaceChanged) => changed || marketplaceChanged,
        );
      })
      .andThen((changed) => {
        if (request.codexGlobal !== true) {
          return ResultAsync.fromSafePromise(Promise.resolve(changed));
        }

        const codexFs = new CliCodexFileSystemAdapter(this.fs);
        return enableGlobalCodexPlugin({
          fs: codexFs,
          force: request.force,
        })
          .map((globalResult) => {
            messages.push(
              `Enabled global Codex plugin config (${globalResult.backupPath ?? "no existing config backup needed"}).`,
            );
            return changed || globalResult.changed;
          })
          .mapErr((cause) => cause);
      })
      .map((changed): InstallResult => {
        if (changed) messages.push("Installed Codex Weave marketplace entry.");
        if (!changed) {
          messages.push("Codex Weave integration already installed.");
        }
        return { harness: this.id, changed, messages };
      })
      .mapErr(
        (cause): InstallError => ({
          type: "InstallFailed",
          harness: this.id,
          path: request.configPath,
          cause,
        }),
      );
  }

  private projectRootFromConfig(configPath: string): string {
    if (configPath.endsWith("/.codex/config.toml")) {
      return dirname(dirname(configPath));
    }
    return this.fs.cwd();
  }

  private writeMarketplace(projectRoot: string, force: boolean) {
    const path = join(projectRoot, ".agents/plugins/marketplace.json");
    return this.fs.exists(path).andThen((exists) => {
      if (!exists) return this.writeManaged(path, renderMarketplace(), force);
      return this.fs
        .readText(path)
        .andThen((content) =>
          this.writeManaged(path, renderMarketplace(content), force),
        );
    });
  }

  private writeRuntimeFiles(projectRoot: string, force: boolean) {
    const pluginRoot = join(projectRoot, "plugins/weave-codex");
    const files: Array<{ path: string; content: string }> = [
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

    let chain = ResultAsync.fromSafePromise<boolean, ManagedWriteCliError>(
      Promise.resolve(false),
    );
    for (const file of files) {
      chain = chain.andThen((changed) =>
        this.writeManaged(file.path, file.content, force).map(
          (fileChanged) => changed || fileChanged,
        ),
      );
    }
    return chain;
  }

  private writeManaged(path: string, content: string, force: boolean) {
    return this.fs.exists(path).andThen((exists) => {
      if (!exists || force) {
        return this.fs.writeText(path, content).map(() => true);
      }

      return this.fs.readText(path).andThen((existing) => {
        if (!existing.includes(WEAVE_MANAGED_MARKER)) {
          return errAsync({
            type: "ForeignFileCollision" as const,
            path,
            message: `Refusing to overwrite ${path} because it is not marked as Weave-managed.`,
          });
        }

        if (existing === content) {
          return this.fs.writeText(path, content).map(() => false);
        }
        return this.fs.writeText(path, content).map(() => true);
      });
    });
  }
}

class CliCodexFileSystemAdapter implements CodexFileSystem {
  constructor(private readonly cliFs: FileSystem) {}

  cwd(): string {
    return this.cliFs.cwd();
  }

  home(): string {
    return this.cliFs.home();
  }

  resolvePath(path: string): string {
    return this.cliFs.resolvePath(path);
  }

  exists(path: string): ResultAsyncType<boolean, CodexFileSystemError> {
    return this.cliFs.exists(path).mapErr(toCodexFsError);
  }

  readText(path: string): ResultAsyncType<string, CodexFileSystemError> {
    return this.cliFs.readText(path).mapErr(toCodexFsError);
  }

  writeText(
    path: string,
    content: string,
  ): ResultAsyncType<void, CodexFileSystemError> {
    return this.cliFs.writeText(path, content).mapErr(toCodexFsError);
  }

  mkdir(path: string): ResultAsyncType<void, CodexFileSystemError> {
    return this.cliFs.mkdir(path).mapErr(toCodexFsError);
  }

  listFiles(path: string): ResultAsyncType<string[], CodexFileSystemError> {
    return this.cliFs.listFiles(path).mapErr(toCodexFsError);
  }

  deleteFile(path: string): ResultAsyncType<void, CodexFileSystemError> {
    return this.cliFs.deleteFile(path).mapErr(toCodexFsError);
  }
}

function toCodexFsError(error: FileSystemError): CodexFileSystemError {
  const operation = error.operation === "copy" ? "write" : error.operation;
  return {
    type: "CodexFileSystemError",
    operation,
    path: error.path,
    cause: error.cause,
  };
}
