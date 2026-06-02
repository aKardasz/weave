import { describe, expect, it } from "bun:test";
import type {
  CodexStepExecutionInput,
  CodexStepExecutionResult,
  CodexStepExecutor,
} from "@weave/adapter-codex";
import { createInMemoryRuntimeStore } from "@weave/engine";
import {
  okAsync,
  ResultAsync,
  type ResultAsync as ResultAsyncType,
} from "neverthrow";
import { parseArgs } from "../../args.js";
import { MemoryFileSystem } from "../../fs/file-system.js";
import type {
  ProcessRunError,
  ProcessRunner,
  ProcessRunResult,
} from "../../process/runner.js";
import {
  runCodexInstall,
  runCodexPackageArtifact,
  runCodexSmoke,
  runCodexWorkflowCommand,
} from "../codex.js";

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

class MockStepExecutor implements CodexStepExecutor {
  execute(input: CodexStepExecutionInput) {
    return okAsync({
      completionSignal: {
        outcome: "success",
        method: input.effect.runAgent.completionMethod,
        message: `Completed ${input.stepName}`,
      },
      exitCode: 0,
      status: "succeeded",
      message: `Completed ${input.stepName}`,
    } satisfies CodexStepExecutionResult);
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

  it("parses codex install and run-workflow flags", () => {
    const install = parseArgs([
      "bun",
      "weave",
      "codex",
      "install",
      "--codex-global",
    ]);
    expect(install.isOk()).toBe(true);
    expect(install._unsafeUnwrap().flags.codexSubcommand).toBe("install");
    expect(install._unsafeUnwrap().flags.codexGlobal).toBe(true);

    const run = parseArgs([
      "bun",
      "weave",
      "codex",
      "run-workflow",
      "quick-fix",
      "--goal",
      "Fix auth",
      "--slug",
      "fix-auth",
      "--max-steps",
      "7",
      "--dry-run",
      "--prune-generated",
    ]);
    expect(run.isOk()).toBe(true);
    const flags = run._unsafeUnwrap().flags;
    expect(flags.codexSubcommand).toBe("run-workflow");
    expect(flags.codexWorkflowName).toBe("quick-fix");
    expect(flags.goal).toBe("Fix auth");
    expect(flags.slug).toBe("fix-auth");
    expect(flags.maxSteps).toBe(7);
    expect(flags.dryRun).toBe(true);
    expect(flags.pruneGenerated).toBe(true);

    const packaged = parseArgs([
      "bun",
      "weave",
      "codex",
      "package-artifact",
      "--output",
      "dist/plugin",
    ]);
    expect(packaged.isOk()).toBe(true);
    expect(packaged._unsafeUnwrap().flags.codexSubcommand).toBe(
      "package-artifact",
    );
    expect(packaged._unsafeUnwrap().flags.output).toBe("dist/plugin");
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
      "/tmp/weave-smoke/.weave/weave-smoke-hooks.jsonl",
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
          stdout: "Installed weave-codex@personal",
          stderr: "",
        },
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
      snapshot["/home/user/plugins/weave-codex/.codex-plugin/plugin.json"],
    ).toContain("weave-codex");
    expect(snapshot["/home/user/plugins/weave-codex/hooks.json"]).toContain(
      "SessionStart",
    );
    expect(snapshot["/home/user/.codex/agents/loom.toml"]).toContain(
      "Codex smoke-test agent",
    );
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      '[plugins."weave-codex".mcp_servers.weave-smoke]',
    );
    expect(snapshot["/home/user/.codex/hooks.json"]).toContain(
      "weave-managed:codex-smoke-global-hook",
    );
    expect(processRunner.calls[1]?.args).toEqual([
      "plugin",
      "add",
      "weave-codex@personal",
    ]);
  });

  it("installs Codex files without writing home files by default", async () => {
    const fs = new MemoryFileSystem(
      {
        "/project/.weave/config.weave": [
          "agent helper {",
          '  prompt "You are a helper."',
          "  mode subagent",
          "}",
        ].join("\n"),
      },
      "/project",
      "/home/user",
    );

    const result = await runCodexInstall({
      fs,
      codexGlobal: false,
      force: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().globalAgentCount).toBe(0);
    const snapshot = fs.snapshot();
    expect(snapshot["/project/.codex/agents/helper.toml"]).toContain(
      'name = "helper"',
    );
    expect(
      snapshot["/project/plugins/weave-codex/.codex-plugin/plugin.json"],
    ).toContain("weave-codex");
    expect(snapshot["/home/user/.codex/config.toml"]).toBeUndefined();
  });

  it("syncs generated Codex agents globally when codexGlobal is enabled", async () => {
    const fs = new MemoryFileSystem(
      {
        "/project/.weave/config.weave": [
          "agent helper {",
          '  prompt "You are a helper."',
          "  mode subagent",
          "}",
        ].join("\n"),
      },
      "/project",
      "/home/user",
    );

    const result = await runCodexInstall({
      fs,
      codexGlobal: true,
      force: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().globalAgentCount).toBe(
      result._unsafeUnwrap().agentCount,
    );
    expect(fs.snapshot()["/home/user/.codex/agents/helper.toml"]).toContain(
      'name = "helper"',
    );
  });

  it("reports stale generated files on codex install dry-run", async () => {
    const fs = new MemoryFileSystem(
      {
        "/project/.weave/config.weave": [
          "agent helper {",
          '  prompt "You are a helper."',
          "  mode subagent",
          "}",
        ].join("\n"),
        "/project/.codex/agents/stale.toml": "# weave-managed\n",
      },
      "/project",
      "/home/user",
    );

    const result = await runCodexInstall({
      fs,
      codexGlobal: false,
      force: true,
      dryRun: true,
      pruneGenerated: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().staleGeneratedCount).toBe(1);
    expect(result._unsafeUnwrap().deletedCount).toBe(0);
    expect(fs.snapshot()["/project/.codex/agents/stale.toml"]).toBeDefined();
  });

  it("prunes stale generated files when requested", async () => {
    const fs = new MemoryFileSystem(
      {
        "/project/.weave/config.weave": [
          "agent helper {",
          '  prompt "You are a helper."',
          "  mode subagent",
          "}",
        ].join("\n"),
        "/project/.codex/agents/stale.toml": "# weave-managed\n",
      },
      "/project",
      "/home/user",
    );

    const result = await runCodexInstall({
      fs,
      codexGlobal: false,
      force: true,
      pruneGenerated: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().deletedCount).toBe(1);
    expect(fs.snapshot()["/project/.codex/agents/stale.toml"]).toBeUndefined();
  });

  it("packages a Codex plugin artifact", async () => {
    const fs = new MemoryFileSystem({}, "/project", "/home/user");

    const result = await runCodexPackageArtifact({
      fs,
      outputRoot: "/project/dist/plugin",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().packageRoot).toBe(
      "/project/dist/plugin/weave-codex",
    );
    expect(
      fs.snapshot()[
        "/project/dist/plugin/weave-codex/.codex-plugin/plugin.json"
      ],
    ).toContain("weave-codex");
    expect(
      fs.snapshot()[
        "/project/dist/plugin/weave-codex/skills/weave/agents/openai.yaml"
      ],
    ).toContain('display_name: "Weave"');
  });

  it("runs a workflow through the Codex command helper", async () => {
    const fs = new MemoryFileSystem(
      {
        "/project/.weave/config.weave": [
          "agent helper {",
          '  prompt "You are a helper."',
          "  mode subagent",
          "}",
          "",
          "workflow codex-one-step {",
          '  description "Fix a bug"',
          "  version 1",
          "",
          "  step fix {",
          '    name "Fix"',
          "    type autonomous",
          "    agent helper",
          '    prompt "Fix: {{instance.goal}}"',
          "    completion agent_signal",
          "  }",
          "}",
        ].join("\n"),
      },
      "/project",
      "/home/user",
    );
    const store = createInMemoryRuntimeStore();

    const result = await runCodexWorkflowCommand({
      fs,
      workflowName: "codex-one-step",
      goal: "Fix auth",
      codexGlobal: false,
      force: true,
      storeFactory: () => store,
      stepExecutor: new MockStepExecutor(),
    });

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.workflowName).toBe("codex-one-step");
    expect(value.status).toBe("completed");
    expect(value.stepsDispatched).toBe(1);
    expect(fs.snapshot()["/project/.codex/agents/helper.toml"]).toContain(
      'name = "helper"',
    );
  });

  it("requires goal for codex run-workflow", async () => {
    const fs = new MemoryFileSystem({}, "/project", "/home/user");
    const result = await runCodexWorkflowCommand({
      fs,
      workflowName: "quick-fix",
      codexGlobal: false,
      force: false,
      storeFactory: () => createInMemoryRuntimeStore(),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("--goal is required");
  });
});
