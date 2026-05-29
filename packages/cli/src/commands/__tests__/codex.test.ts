import { describe, expect, it } from "bun:test";
import { ResultAsync, type ResultAsync as ResultAsyncType } from "neverthrow";
import { parseArgs } from "../../args.js";
import { MemoryFileSystem } from "../../fs/file-system.js";
import type {
  ProcessRunError,
  ProcessRunner,
  ProcessRunResult,
} from "../../process/runner.js";
import { runCodexSmoke } from "../codex.js";

class MockProcessRunner implements ProcessRunner {
  readonly calls: Array<{
    command: string;
    args: string[];
    options?: { cwd?: string; env?: Record<string, string> };
  }> = [];

  constructor(
    private readonly responses: ProcessRunResult[],
    private readonly onRun?: (input: {
      command: string;
      args: string[];
      options?: { cwd?: string; env?: Record<string, string> };
    }) => Promise<void>,
  ) {}

  run(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): ResultAsyncType<ProcessRunResult, ProcessRunError> {
    this.calls.push({ command, args, options });
    const response = this.responses.shift() ?? {
      exitCode: 0,
      stdout: "",
      stderr: "",
    };
    return ResultAsync.fromPromise(
      this.onRun?.({ command, args, options }).then(() => response) ??
        Promise.resolve(response),
      (cause): ProcessRunError => ({
        type: "ProcessRunError",
        command,
        args,
        cause,
      }),
    );
  }
}

describe("codex command", () => {
  it("parses codex smoke flags", () => {
    const result = parseArgs([
      "bun",
      "weave",
      "codex",
      "smoke",
      "--codex-global",
      "--keep-temp",
    ]);

    expect(result.isOk()).toBe(true);
    const parsed = result._unsafeUnwrap();
    expect(parsed.command).toBe("codex");
    expect(parsed.flags.codexSubcommand).toBe("smoke");
    expect(parsed.flags.codexGlobal).toBe(true);
    expect(parsed.flags.keepTemp).toBe(true);
  });

  it("reports CodexCliUnavailable for missing optional dependency", async () => {
    const fs = new MemoryFileSystem();
    const processRunner = new MockProcessRunner([
      {
        exitCode: 1,
        stdout: "",
        stderr: "Missing optional dependency @openai/codex-linux-x64",
      },
    ]);

    const result = await runCodexSmoke({
      fs,
      processRunner,
      codexGlobal: false,
      keepTemp: true,
      tempRoot: "/tmp/weave-smoke",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("CodexCliUnavailable");
  });

  it("runs mocked smoke success path and validates proof files", async () => {
    const fs = new MemoryFileSystem({}, "/project", "/home/user");
    const processRunner = new MockProcessRunner(
      [
        { exitCode: 0, stdout: "codex 1.0.0", stderr: "" },
        {
          exitCode: 0,
          stdout: "weave_smoke plugin weave-codex ok",
          stderr: "",
        },
      ],
      async ({ options }) => {
        const proof = options?.env?.WEAVE_CODEX_SMOKE_PROOF;
        if (proof !== undefined) {
          await fs.writeText(proof, '{"marker":"weave-managed"}\n');
        }
      },
    );

    const result = await runCodexSmoke({
      fs,
      processRunner,
      codexGlobal: false,
      keepTemp: true,
      tempRoot: "/tmp/weave-smoke",
    });

    expect(result.isOk()).toBe(true);
    expect(processRunner.calls[1]?.args).toContain("exec");
    expect(processRunner.calls[1]?.args).not.toContain("--ask-for-approval");
    expect(processRunner.calls[1]?.args).toContain("approval_policy=never");
    expect(processRunner.calls[1]?.args).toContain("hooks");
    expect(processRunner.calls[1]?.args).toContain("plugin_hooks");
    expect(processRunner.calls[1]?.args).toContain("plugins");
    expect(processRunner.calls[1]?.args).toContain("apps");
    expect(processRunner.calls[1]?.options?.env?.WEAVE_CODEX_SMOKE_PROOF).toBe(
      "/tmp/weave-smoke/.codex/weave-smoke-hooks.jsonl",
    );
    const snapshot = fs.snapshot();
    expect(snapshot["/tmp/weave-smoke/.codex/agents/loom.toml"]).toContain(
      "loom",
    );
    expect(
      snapshot[
        "/tmp/weave-smoke/plugins/weave-codex/apps/weave-smoke-app.json"
      ],
    ).toContain("weave-smoke");
  });

  it("uses a hermetic smoke config instead of starter skill references", async () => {
    const fs = new MemoryFileSystem(
      {
        "/home/user/.weave/config.weave": [
          "agent loom {",
          '  prompt "Global user loom"',
          '  skills ["missing-global-skill"]',
          "}",
        ].join("\n"),
      },
      "/project",
      "/home/user",
    );
    const processRunner = new MockProcessRunner(
      [
        { exitCode: 0, stdout: "codex 1.0.0", stderr: "" },
        {
          exitCode: 0,
          stdout: "weave_smoke plugin weave-codex ok",
          stderr: "",
        },
      ],
      async ({ options }) => {
        const proof = options?.env?.WEAVE_CODEX_SMOKE_PROOF;
        if (proof !== undefined) {
          await fs.writeText(proof, '{"marker":"weave-managed"}\n');
        }
      },
    );

    const result = await runCodexSmoke({
      fs,
      processRunner,
      codexGlobal: false,
      keepTemp: true,
      tempRoot: "/tmp/weave-smoke",
    });

    expect(result.isOk()).toBe(true);
    const snapshot = fs.snapshot();
    expect(snapshot["/tmp/weave-smoke/.weave/config.weave"]).not.toContain(
      "code-review",
    );
    expect(snapshot["/tmp/weave-smoke/.codex/agents/loom.toml"]).toContain(
      "Codex smoke-test agent",
    );
    expect(snapshot["/tmp/weave-smoke/.codex/agents/loom.toml"]).not.toContain(
      "missing-global-skill",
    );
  });

  it("writes global home files only when codexGlobal is enabled", async () => {
    const fs = new MemoryFileSystem(
      {
        "/home/user/.codex/config.toml": "[features]\napps = false\n",
      },
      "/project",
      "/home/user",
    );
    const processRunner = new MockProcessRunner(
      [
        { exitCode: 0, stdout: "codex 1.0.0", stderr: "" },
        {
          exitCode: 0,
          stdout: "weave_smoke plugin weave-codex ok",
          stderr: "",
        },
      ],
      async ({ options }) => {
        const proof = options?.env?.WEAVE_CODEX_SMOKE_PROOF;
        if (proof !== undefined) {
          await fs.writeText(proof, '{"marker":"weave-managed"}\n');
        }
      },
    );

    const result = await runCodexSmoke({
      fs,
      processRunner,
      codexGlobal: true,
      keepTemp: true,
      tempRoot: "/tmp/weave-smoke",
    });

    expect(result.isOk()).toBe(true);
    const snapshot = fs.snapshot();
    expect(
      snapshot[
        "/home/user/.codex/plugins/weave-codex/.codex-plugin/plugin.json"
      ],
    ).toContain("weave-codex");
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      '[plugins."weave-codex".mcp_servers.weave-smoke]',
    );
  });
});
