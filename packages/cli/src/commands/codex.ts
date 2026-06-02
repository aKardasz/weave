import { join, resolve } from "node:path";
import {
  CODEX_SMOKE_MCP_TOOL_NAME,
  CodexAdapter,
  type CodexStepExecutor,
  type CodexWorkflowRuntimeError,
  enableGlobalCodexPlugin,
  MemoryCodexFileSystem,
  materializeCodexProject,
  packageCodexPluginArtifact,
  runCodexWorkflow,
} from "@weave/adapter-codex";
import {
  type ConfigLoadError,
  type FileReader,
  loadConfig,
} from "@weave/config";
import type { WeaveConfig } from "@weave/core";
import { createSqliteRuntimeStore, type RuntimeStore } from "@weave/engine";
import { errAsync, ok, type Result, ResultAsync } from "neverthrow";
import type { ParsedArgs } from "../args.js";
import type { CliError } from "../errors.js";
import {
  BunFileSystem,
  describeFileSystemError,
  type FileSystem,
} from "../fs/file-system.js";
import type { TerminalIO } from "../io/terminal.js";
import { BunProcessRunner, type ProcessRunner } from "../process/runner.js";
import type { ThemeColors } from "../theme/colors.js";

export interface CodexContext {
  terminal: TerminalIO;
  theme: ThemeColors;
  flags: ParsedArgs["flags"];
  subcommand?: "smoke" | "install" | "run-workflow" | "package-artifact";
  fs?: FileSystem;
  processRunner?: ProcessRunner;
  tempRoot?: string;
}

export type CodexSmokeError =
  | {
      type: "CodexCliUnavailable";
      message: string;
      instruction: string;
      stdout: string;
      stderr: string;
    }
  | { type: "SmokeFailed"; message: string }
  | { type: "FileSystemError"; message: string };

export async function runCodex(
  ctx: CodexContext,
): Promise<Result<number, CliError>> {
  if (ctx.subcommand === "smoke") {
    const result = await runCodexSmoke({
      fs: ctx.fs ?? new BunFileSystem(),
      processRunner: ctx.processRunner ?? new BunProcessRunner(),
      codexGlobal: ctx.flags.codexGlobal === true,
      keepTemp: ctx.flags.keepTemp === true,
      tempRoot: ctx.tempRoot,
    });

    if (result.isErr()) {
      ctx.terminal.stderr(formatCodexSmokeError(result.error));
      return ok(1);
    }

    ctx.terminal.stdout(
      [
        "Codex smoke passed.",
        `Temp repo: ${result.value.projectRoot}`,
        `Agent: ${result.value.agentPath}`,
        `Hook proof: ${result.value.hookProofPath}`,
      ].join("\n"),
    );
    return ok(0);
  }

  if (ctx.subcommand === "install") {
    const result = await runCodexInstall({
      fs: ctx.fs ?? new BunFileSystem(),
      codexGlobal: ctx.flags.codexGlobal === true,
      force: ctx.flags.force,
      dryRun: ctx.flags.dryRun === true,
      pruneGenerated: ctx.flags.pruneGenerated === true,
    });

    if (result.isErr()) {
      ctx.terminal.stderr(result.error.message);
      return ok(1);
    }

    ctx.terminal.stdout(
      [
        "Codex files installed.",
        `Project: ${result.value.projectRoot}`,
        `Agents: ${result.value.agentCount}`,
        `Global agents: ${result.value.globalAgentCount}`,
        `Stale generated: ${result.value.staleGeneratedCount}`,
        `Deleted: ${result.value.deletedCount}`,
        `Collisions: ${result.value.collisionCount}`,
      ].join("\n"),
    );
    return ok(0);
  }

  if (ctx.subcommand === "package-artifact") {
    const result = await runCodexPackageArtifact({
      fs: ctx.fs ?? new BunFileSystem(),
      outputRoot: ctx.flags.output,
    });

    if (result.isErr()) {
      ctx.terminal.stderr(result.error.message);
      return ok(1);
    }

    ctx.terminal.stdout(
      [
        "Codex plugin artifact packaged.",
        `Package: ${result.value.packageRoot}`,
        `Files: ${result.value.fileCount}`,
      ].join("\n"),
    );
    return ok(0);
  }

  if (ctx.subcommand === "run-workflow") {
    const result = await runCodexWorkflowCommand({
      fs: ctx.fs ?? new BunFileSystem(),
      workflowName: ctx.flags.codexWorkflowName,
      goal: ctx.flags.goal,
      slug: ctx.flags.slug,
      maxSteps: ctx.flags.maxSteps,
      codexGlobal: ctx.flags.codexGlobal === true,
      force: ctx.flags.force,
    });

    if (result.isErr()) {
      ctx.terminal.stderr(result.error.message);
      return ok(1);
    }

    ctx.terminal.stdout(
      [
        "Codex workflow completed.",
        `Workflow: ${result.value.workflowName}`,
        `Instance: ${result.value.workflowInstanceId}`,
        `Status: ${result.value.status}`,
        `Steps: ${result.value.stepsDispatched}`,
      ].join("\n"),
    );
    return ok(0);
  }

  if (ctx.subcommand === undefined) {
    ctx.terminal.stderr(
      [
        "Usage:",
        "  weave codex install [--codex-global] [--force] [--dry-run] [--prune-generated]",
        "  weave codex package-artifact [--output <dir>]",
        "  weave codex run-workflow <workflow> --goal <text> [--slug <slug>] [--codex-global] [--max-steps <n>]",
        "  weave codex smoke [--codex-global] [--keep-temp]",
        "",
        "Installs Codex project files, executes Weave workflows, or runs an isolated plugin smoke test.",
      ].join("\n"),
    );
    return ok(1);
  }

  return ok(1);
}

export type CodexSmokeResult = {
  projectRoot: string;
  agentPath: string;
  marketplacePath: string;
  hookProofPath: string;
};

export type CodexInstallResult = {
  projectRoot: string;
  agentCount: number;
  globalAgentCount: number;
  staleGeneratedCount: number;
  deletedCount: number;
  collisionCount: number;
};

export type CodexPackageArtifactResult = {
  packageRoot: string;
  fileCount: number;
};

export type CodexWorkflowCommandResult = {
  projectRoot: string;
  workflowName: string;
  workflowInstanceId: string;
  status: "completed" | "paused" | "failed";
  stepsDispatched: number;
};

type CodexCommandError = {
  type: "CodexCommandFailed";
  message: string;
};

const CODEX_SMOKE_CONFIG = `# Weave Codex smoke config
# This fixture is intentionally self-contained: no external skills or prompt files.

agent loom {
  description "Codex smoke orchestration agent"
  prompt "You are a Codex smoke-test agent. Use generated plugin surfaces when asked and report concise status."
  models ["gpt-5"]
  mode primary
  temperature 0.1

  tool_policy {
    read allow
    write ask
    execute ask
    delegate deny
    network deny
  }
}

disable agents []
disable hooks []
disable skills []

settings {
  log_level INFO
}
`;

export function runCodexSmoke(input: {
  fs: FileSystem;
  processRunner: ProcessRunner;
  codexGlobal: boolean;
  keepTemp: boolean;
  tempRoot?: string;
}): ResultAsync<CodexSmokeResult, CodexSmokeError> {
  const projectRoot =
    input.tempRoot ?? join("/tmp", `weave-codex-smoke-${Date.now()}`);
  const codexFs = new CliCodexFileSystemAdapter(input.fs);

  return preflightCodex(input.processRunner)
    .andThen(() => writeSmokeConfig(input.fs, projectRoot))
    .andThen(() =>
      materializeCodexProject({
        projectRoot,
        fileReader: createSmokeFileReader(input.fs, projectRoot),
        adapterOptions: { fs: codexFs, force: true },
      }).mapErr(
        (error): CodexSmokeError => ({
          type: "SmokeFailed",
          message: `Codex materialization failed: ${JSON.stringify(error)}`,
        }),
      ),
    )
    .andThen((materialized) => {
      if (!input.codexGlobal)
        return ResultAsync.fromSafePromise(Promise.resolve(materialized));
      return enableGlobalCodexPlugin({
        fs: codexFs,
        force: true,
        agentArtifacts: materialized.agentArtifacts,
      })
        .mapErr(
          (error): CodexSmokeError => ({
            type: "SmokeFailed",
            message: `Global Codex enablement failed: ${JSON.stringify(error)}`,
          }),
        )
        .map(() => materialized);
    })
    .andThen(() => {
      if (!input.codexGlobal)
        return ResultAsync.fromSafePromise(Promise.resolve());
      return installGlobalCodexPlugin(input.processRunner);
    })
    .andThen(() =>
      runCodexExec({
        processRunner: input.processRunner,
        projectRoot,
      }),
    )
    .andThen((execResult) =>
      verifySmokeProofs({
        fs: input.fs,
        projectRoot,
        output: `${execResult.stdout}\n${execResult.stderr}`,
      }),
    );
}

export function runCodexInstall(input: {
  fs: FileSystem;
  codexGlobal: boolean;
  force: boolean;
  dryRun?: boolean;
  pruneGenerated?: boolean;
}): ResultAsync<CodexInstallResult, CodexCommandError> {
  const projectRoot = input.fs.cwd();
  const codexFs = new CliCodexFileSystemAdapter(input.fs);

  return materializeCodexProject({
    projectRoot,
    fileReader: createCliFileReader(input.fs),
    adapterOptions: { fs: codexFs, force: input.force },
    pruneGenerated: input.pruneGenerated === true && input.dryRun !== true,
  })
    .mapErr(
      (error): CodexCommandError => ({
        type: "CodexCommandFailed",
        message: `Codex materialization failed: ${JSON.stringify(error)}`,
      }),
    )
    .andThen((materialized) => {
      if (!input.codexGlobal) {
        return ResultAsync.fromSafePromise(Promise.resolve(materialized));
      }

      return enableGlobalCodexPlugin({
        fs: codexFs,
        force: input.force,
        agentArtifacts: materialized.agentArtifacts,
      })
        .map((globalResult) => ({ materialized, globalResult }))
        .mapErr(
          (error): CodexCommandError => ({
            type: "CodexCommandFailed",
            message: `Global Codex enablement failed: ${JSON.stringify(error)}`,
          }),
        );
    })
    .map((result) => {
      const materialized =
        "globalResult" in result ? result.materialized : result;
      const globalAgentCount =
        "globalResult" in result ? result.globalResult.globalAgentCount : 0;
      return {
        projectRoot,
        agentCount: materialized.agentCount,
        globalAgentCount,
        staleGeneratedCount: materialized.artifactInventory.staleOwned.length,
        deletedCount: materialized.artifactInventory.deleted.length,
        collisionCount: materialized.artifactInventory.collisions.length,
      };
    });
}

export function runCodexPackageArtifact(input: {
  fs: FileSystem;
  outputRoot?: string;
}): ResultAsync<CodexPackageArtifactResult, CodexCommandError> {
  const codexFs = new CliCodexFileSystemAdapter(input.fs);

  return packageCodexPluginArtifact({
    fs: codexFs,
    outputRoot: input.outputRoot ?? ".weave/codex-plugin-package",
  })
    .mapErr(
      (error): CodexCommandError => ({
        type: "CodexCommandFailed",
        message: `Codex plugin package failed: ${JSON.stringify(error)}`,
      }),
    )
    .map((result) => ({
      packageRoot: result.packageRoot,
      fileCount: result.writtenPaths.length,
    }));
}

export function runCodexWorkflowCommand(input: {
  fs: FileSystem;
  workflowName?: string;
  goal?: string;
  slug?: string;
  maxSteps?: number;
  codexGlobal: boolean;
  force: boolean;
  storeFactory?: (dbPath: string) => RuntimeStore;
  stepExecutor?: CodexStepExecutor;
}): ResultAsync<CodexWorkflowCommandResult, CodexCommandError> {
  const projectRoot = input.fs.cwd();
  const workflowName = input.workflowName;
  const goal = input.goal;

  if (workflowName === undefined || workflowName.trim().length === 0) {
    return errAsync({
      type: "CodexCommandFailed",
      message:
        "Usage: weave codex run-workflow <workflow> --goal <text> [--slug <slug>] [--codex-global] [--max-steps <n>]",
    });
  }

  if (goal === undefined || goal.trim().length === 0) {
    return errAsync({
      type: "CodexCommandFailed",
      message: "--goal is required for weave codex run-workflow.",
    });
  }

  const codexFs = new CliCodexFileSystemAdapter(input.fs);
  const fileReader = createCliFileReader(input.fs);
  const slug = input.slug ?? slugify(goal);

  return loadCodexConfig(projectRoot, fileReader)
    .andThen((config) =>
      materializeCodexProject({
        projectRoot,
        fileReader,
        adapterOptions: { fs: codexFs, force: input.force },
      })
        .map((materialized) => ({ config, materialized }))
        .mapErr(
          (error): CodexCommandError => ({
            type: "CodexCommandFailed",
            message: `Codex materialization failed: ${JSON.stringify(error)}`,
          }),
        ),
    )
    .andThen(({ config, materialized }) => {
      if (!input.codexGlobal) {
        return ResultAsync.fromSafePromise(Promise.resolve(config));
      }

      return enableGlobalCodexPlugin({
        fs: codexFs,
        force: input.force,
        agentArtifacts: materialized.agentArtifacts,
      })
        .map(() => config)
        .mapErr(
          (error): CodexCommandError => ({
            type: "CodexCommandFailed",
            message: `Global Codex enablement failed: ${JSON.stringify(error)}`,
          }),
        );
    })
    .andThen((config) => {
      const adapter = new CodexAdapter({
        projectRoot,
        fs: codexFs,
        force: input.force,
      });
      const dbPath = resolve(projectRoot, ".weave/runtime/weave.db");
      const store =
        input.storeFactory?.(dbPath) ?? createSqliteRuntimeStore({ dbPath });

      return ResultAsync.fromPromise(
        adapter.init(),
        (cause): CodexCommandError => ({
          type: "CodexCommandFailed",
          message: `Codex adapter initialization failed: ${String(cause)}`,
        }),
      ).andThen(() =>
        runCodexWorkflow({
          config,
          workflowName,
          goal,
          slug,
          adapter,
          store,
          planStateProvider: adapter.planStateProvider,
          maxSteps: input.maxSteps,
          stepExecutor: input.stepExecutor,
        }).mapErr(
          (error): CodexCommandError => ({
            type: "CodexCommandFailed",
            message: formatCodexWorkflowError(error),
          }),
        ),
      );
    })
    .map((result) => ({
      projectRoot,
      workflowName,
      workflowInstanceId: result.workflowInstanceId,
      status: result.status,
      stepsDispatched: result.stepsDispatched,
    }));
}

function preflightCodex(
  processRunner: ProcessRunner,
): ResultAsync<void, CodexSmokeError> {
  return processRunner
    .run("codex", ["--version"])
    .mapErr(
      (error): CodexSmokeError => ({
        type: "SmokeFailed",
        message: `Failed to run ${error.command}: ${String(error.cause)}`,
      }),
    )
    .andThen((result) => {
      if (result.exitCode === 0)
        return ResultAsync.fromSafePromise(Promise.resolve());

      const output = `${result.stdout}\n${result.stderr}`;
      if (
        output.includes("Missing optional dependency @openai/codex-linux-x64")
      ) {
        return errAsync<void, CodexSmokeError>({
          type: "CodexCliUnavailable",
          message:
            "Codex CLI is installed but its Linux optional dependency is missing.",
          instruction: "Reinstall Codex: npm install -g @openai/codex@latest",
          stdout: result.stdout,
          stderr: result.stderr,
        });
      }

      return errAsync<void, CodexSmokeError>({
        type: "SmokeFailed",
        message: `codex --version failed with exit ${result.exitCode}: ${output.trim()}`,
      });
    });
}

function writeSmokeConfig(
  fs: FileSystem,
  projectRoot: string,
): ResultAsync<void, CodexSmokeError> {
  const configPath = join(projectRoot, ".weave/config.weave");
  return fs.writeText(configPath, CODEX_SMOKE_CONFIG).mapErr(
    (error): CodexSmokeError => ({
      type: "FileSystemError",
      message: describeFileSystemError(error),
    }),
  );
}

function createSmokeFileReader(
  fs: FileSystem,
  projectRoot: string,
): FileReader {
  const projectConfigPath = fs.resolvePath(
    join(projectRoot, ".weave/config.weave"),
  );

  return {
    exists(path: string): Promise<boolean> {
      if (fs.resolvePath(path) !== projectConfigPath) {
        return Promise.resolve(false);
      }

      return fs.exists(path).match(
        (exists) => exists,
        () => false,
      );
    },
    read(path: string): ResultAsync<string, ConfigLoadError> {
      return fs.readText(path).mapErr(
        (error): ConfigLoadError => ({
          type: "FileReadError",
          path: error.path,
          cause: error.cause,
        }),
      );
    },
  };
}

function createCliFileReader(fs: FileSystem): FileReader {
  return {
    exists(path: string): Promise<boolean> {
      return fs.exists(path).match(
        (exists) => exists,
        () => false,
      );
    },
    read(path: string): ResultAsync<string, ConfigLoadError> {
      return fs.readText(path).mapErr(
        (error): ConfigLoadError => ({
          type: "FileReadError",
          path: error.path,
          cause: error.cause,
        }),
      );
    },
  };
}

function loadCodexConfig(
  projectRoot: string,
  fileReader: FileReader,
): ResultAsync<WeaveConfig, CodexCommandError> {
  return loadConfig(projectRoot, fileReader).mapErr(
    (error): CodexCommandError => ({
      type: "CodexCommandFailed",
      message: `Failed to load Weave config: ${JSON.stringify(error)}`,
    }),
  );
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 0) return slug;
  return "codex-workflow";
}

function formatCodexWorkflowError(error: CodexWorkflowRuntimeError): string {
  switch (error.type) {
    case "WorkflowNotFound":
      return `Workflow not found: ${error.workflowName}`;
    case "MaxStepsExceeded":
      return `Codex workflow exceeded max steps: ${error.maxSteps}`;
    case "RuntimeStoreError":
      return `Runtime Store error: ${JSON.stringify(error.cause)}`;
    case "CodexStepExecutionError":
      return `Codex step execution error: ${JSON.stringify(error.cause)}`;
    case "LifecycleError":
      return `Workflow lifecycle error: ${JSON.stringify(error.cause)}`;
  }
}

function installGlobalCodexPlugin(
  processRunner: ProcessRunner,
): ResultAsync<void, CodexSmokeError> {
  return processRunner
    .run("codex", ["plugin", "add", "weave-codex@personal"])
    .mapErr(
      (error): CodexSmokeError => ({
        type: "SmokeFailed",
        message: `Failed to run ${error.command}: ${String(error.cause)}`,
      }),
    )
    .andThen((result) => {
      if (result.exitCode === 0) {
        return ResultAsync.fromSafePromise(Promise.resolve());
      }

      const output = `${result.stdout}\n${result.stderr}`.trim();
      return errAsync<void, CodexSmokeError>({
        type: "SmokeFailed",
        message: `codex plugin add failed with exit ${result.exitCode}: ${output}`,
      });
    });
}

function runCodexExec(input: {
  processRunner: ProcessRunner;
  projectRoot: string;
}) {
  return input.processRunner
    .run(
      "codex",
      [
        "exec",
        "--cd",
        input.projectRoot,
        "--skip-git-repo-check",
        "--dangerously-bypass-hook-trust",
        "--sandbox",
        "workspace-write",
        "-c",
        "approval_policy=never",
        "--enable",
        "hooks",
        "--enable",
        "plugin_hooks",
        "--enable",
        "plugins",
        "--enable",
        "apps",
        [
          "Run the generated Weave smoke hook script exactly once, then use the Weave smoke MCP surface and report the plugin status.",
          `Hook command: WEAVE_CODEX_SMOKE_GLOBAL_FALLBACK=weave-managed WEAVE_CODEX_SMOKE_PROOF='${smokeProofPath(input.projectRoot)}' PLUGIN_ROOT="$PWD/plugins/weave-codex" bun run plugins/weave-codex/hooks/weave-smoke-hook.ts`,
          `MCP tool: ${CODEX_SMOKE_MCP_TOOL_NAME}. If it is not mounted as a native callable tool, invoke plugins/weave-codex/mcp/weave-smoke-mcp.ts directly over JSON-RPC with tools/call.`,
        ].join("\n"),
      ],
      {
        env: {
          WEAVE_CODEX_SMOKE_PROOF: smokeProofPath(input.projectRoot),
        },
      },
    )
    .mapErr(
      (error): CodexSmokeError => ({
        type: "SmokeFailed",
        message: `Failed to run ${error.command}: ${String(error.cause)}`,
      }),
    )
    .andThen((result) => {
      if (result.exitCode === 0)
        return ResultAsync.fromSafePromise(Promise.resolve(result));
      return errAsync({
        type: "SmokeFailed" as const,
        message: `codex exec failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`,
      });
    });
}

function verifySmokeProofs(input: {
  fs: FileSystem;
  projectRoot: string;
  output: string;
}): ResultAsync<CodexSmokeResult, CodexSmokeError> {
  const agentPath = join(input.projectRoot, ".codex/agents/loom.toml");
  const marketplacePath = join(
    input.projectRoot,
    ".agents/plugins/marketplace.json",
  );
  const hookProofPath = smokeProofPath(input.projectRoot);
  const appPath = join(
    input.projectRoot,
    "plugins/weave-codex/apps/weave-smoke-app.json",
  );

  return requireFile(input.fs, agentPath, "generated agent TOML")
    .andThen(() => requireFile(input.fs, marketplacePath, "plugin marketplace"))
    .andThen(() => requireFile(input.fs, hookProofPath, "hook proof file"))
    .andThen(() => requireFile(input.fs, appPath, "app metadata"))
    .andThen(() => {
      if (input.output.includes(CODEX_SMOKE_MCP_TOOL_NAME)) {
        return ResultAsync.fromSafePromise(
          Promise.resolve({
            projectRoot: input.projectRoot,
            agentPath,
            marketplacePath,
            hookProofPath,
          }),
        );
      }

      return errAsync<CodexSmokeResult, CodexSmokeError>({
        type: "SmokeFailed",
        message: `Codex output did not mention ${CODEX_SMOKE_MCP_TOOL_NAME}.`,
      });
    });
}

function smokeProofPath(projectRoot: string): string {
  return join(projectRoot, ".weave/weave-smoke-hooks.jsonl");
}

function requireFile(
  fs: FileSystem,
  path: string,
  label: string,
): ResultAsync<void, CodexSmokeError> {
  return fs
    .exists(path)
    .mapErr(
      (error): CodexSmokeError => ({
        type: "FileSystemError",
        message: describeFileSystemError(error),
      }),
    )
    .andThen((exists) => {
      if (exists) return ResultAsync.fromSafePromise(Promise.resolve());
      return errAsync<void, CodexSmokeError>({
        type: "SmokeFailed",
        message: `Missing ${label}: ${path}`,
      });
    });
}

function formatCodexSmokeError(error: CodexSmokeError): string {
  switch (error.type) {
    case "CodexCliUnavailable":
      return `${error.message}\n${error.instruction}`;
    case "FileSystemError":
    case "SmokeFailed":
      return error.message;
  }
}

class CliCodexFileSystemAdapter extends MemoryCodexFileSystem {
  constructor(private readonly cliFs: FileSystem) {
    super({}, cliFs.cwd(), cliFs.home());
  }

  override cwd(): string {
    return this.cliFs.cwd();
  }

  override home(): string {
    return this.cliFs.home();
  }

  override resolvePath(path: string): string {
    return this.cliFs.resolvePath(path);
  }

  override exists(path: string) {
    return this.cliFs.exists(path).mapErr((error) => ({
      type: "CodexFileSystemError" as const,
      operation: error.operation === "copy" ? "write" : error.operation,
      path: error.path,
      cause: error.cause,
    }));
  }

  override readText(path: string) {
    return this.cliFs.readText(path).mapErr((error) => ({
      type: "CodexFileSystemError" as const,
      operation: error.operation === "copy" ? "read" : error.operation,
      path: error.path,
      cause: error.cause,
    }));
  }

  override writeText(path: string, content: string) {
    return this.cliFs.writeText(path, content).mapErr((error) => ({
      type: "CodexFileSystemError" as const,
      operation: error.operation === "copy" ? "write" : error.operation,
      path: error.path,
      cause: error.cause,
    }));
  }

  override mkdir(path: string) {
    return this.cliFs.mkdir(path).mapErr((error) => ({
      type: "CodexFileSystemError" as const,
      operation: error.operation === "copy" ? "mkdir" : error.operation,
      path: error.path,
      cause: error.cause,
    }));
  }

  override listFiles(path: string) {
    return this.cliFs.listFiles(path).mapErr((error) => ({
      type: "CodexFileSystemError" as const,
      operation: error.operation === "copy" ? "list" : error.operation,
      path: error.path,
      cause: error.cause,
    }));
  }

  override deleteFile(path: string) {
    return this.cliFs.deleteFile(path).mapErr((error) => ({
      type: "CodexFileSystemError" as const,
      operation: error.operation === "copy" ? "delete" : error.operation,
      path: error.path,
      cause: error.cause,
    }));
  }
}
