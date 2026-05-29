import { join } from "node:path";
import {
  CODEX_SMOKE_MCP_TOOL_NAME,
  enableGlobalCodexPlugin,
  MemoryCodexFileSystem,
  materializeCodexProject,
} from "@weave/adapter-codex";
import type { ConfigLoadError, FileReader } from "@weave/config";
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
  subcommand?: "smoke";
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
  if (ctx.subcommand !== "smoke") {
    ctx.terminal.stderr(
      [
        "Usage: weave codex smoke [--codex-global] [--keep-temp]",
        "",
        "Runs an isolated Codex plugin smoke test for generated hooks, MCP, and app metadata.",
      ].join("\n"),
    );
    return ok(1);
  }

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

export type CodexSmokeResult = {
  projectRoot: string;
  agentPath: string;
  marketplacePath: string;
  hookProofPath: string;
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
    .andThen(() => {
      if (!input.codexGlobal)
        return ResultAsync.fromSafePromise(Promise.resolve());
      return enableGlobalCodexPlugin({ fs: codexFs, force: true }).mapErr(
        (error): CodexSmokeError => ({
          type: "SmokeFailed",
          message: `Global Codex enablement failed: ${JSON.stringify(error)}`,
        }),
      );
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
        `Use the weave smoke MCP tool ${CODEX_SMOKE_MCP_TOOL_NAME} and report the plugin status.`,
      ],
      {
        env: {
          WEAVE_CODEX_SMOKE_PROOF: join(
            input.projectRoot,
            ".codex/weave-smoke-hooks.jsonl",
          ),
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
  const hookProofPath = join(
    input.projectRoot,
    ".codex/weave-smoke-hooks.jsonl",
  );
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
}
