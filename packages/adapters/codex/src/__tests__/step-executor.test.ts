import { describe, expect, it } from "bun:test";
import type { WeaveConfig } from "@weave/core";
import {
  completeStep,
  createInMemoryRuntimeStore,
  createWorkflowInstanceId,
  type DispatchAgentEffect,
  dispatchStep,
  startExecution,
} from "@weave/engine";
import { okAsync, type ResultAsync as ResultAsyncType } from "neverthrow";
import {
  CodexAdapter,
  CodexExecStepExecutor,
  type CodexProcessRunError,
  type CodexProcessRunner,
  type CodexProcessRunResult,
  MemoryCodexFileSystem,
  StaticCodexNativeCapabilityProvider,
} from "../index.js";

const CONFIG: WeaveConfig = {
  agents: {
    helper: {
      prompt: "You are a helper.",
      mode: "subagent",
      tool_policy: {
        read: "allow",
        write: "allow",
        execute: "ask",
        delegate: "deny",
        network: "deny",
      },
    },
  },
  categories: {},
  disabled: { agents: [], hooks: [], skills: [] },
  settings: {
    log_level: "INFO",
    runtime: { journal: { strict: false } },
  },
  workflows: {
    "one-step": {
      version: 1,
      steps: [
        {
          name: "fix",
          type: "autonomous",
          agent: "helper",
          prompt: "Fix: {{instance.goal}}",
          completion: { method: "agent_signal" },
        },
      ],
    },
  },
};

class MockProcessRunner implements CodexProcessRunner {
  readonly calls: Array<{
    command: string;
    args: readonly string[];
    options?: { readonly cwd?: string; readonly env?: Record<string, string> };
  }> = [];

  constructor(private readonly result: CodexProcessRunResult) {}

  run(
    command: string,
    args: readonly string[],
    options?: { readonly cwd?: string; readonly env?: Record<string, string> },
  ): ResultAsyncType<CodexProcessRunResult, CodexProcessRunError> {
    this.calls.push({ command, args, options });
    return okAsync(this.result);
  }
}

async function dispatchFixture() {
  const workflowInstanceId = createWorkflowInstanceId("wf-1");
  const store = createInMemoryRuntimeStore();
  const context = {
    workflowName: "one-step",
    goal: "Repair auth",
    slug: "repair-auth",
    workflows: CONFIG.workflows,
  };
  const started = await startExecution(
    {
      workflowInstanceId,
      ownerId: "test-owner",
      context,
    },
    store,
  );
  const leaseId = started._unsafeUnwrap().leaseId;
  const dispatched = await dispatchStep(
    {
      workflowInstanceId,
      leaseId,
      context,
    },
    store,
  );
  const dispatch = dispatched._unsafeUnwrap().effects[0] as DispatchAgentEffect;
  return {
    workflowInstanceId,
    leaseId,
    store,
    context,
    dispatch,
    stepName: dispatched._unsafeUnwrap().stepName,
  };
}

describe("CodexExecStepExecutor", () => {
  it("invokes codex exec with the rendered workflow step prompt", async () => {
    const fixture = await dispatchFixture();
    const fs = new MemoryCodexFileSystem();
    const adapter = new CodexAdapter({
      fs,
      projectRoot: "/project",
      force: true,
    });
    const processRunner = new MockProcessRunner({
      exitCode: 0,
      stdout: JSON.stringify({
        message: "raw completion that must not be journaled",
      }),
      stderr: "",
    });
    const executor = new CodexExecStepExecutor({
      projectRoot: "/project",
      processRunner,
      capabilityProvider: new StaticCodexNativeCapabilityProvider({
        canExecuteCustomAgent: true,
        selectorFlag: "--agent",
        source: "injected",
        detail: "test",
      }),
    });

    const result = await executor.execute({
      effect: fixture.dispatch,
      stepName: fixture.stepName,
      workflowConfig: CONFIG.workflows["one-step"],
      workflowInstanceId: fixture.workflowInstanceId,
      store: fixture.store,
      adapter,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe("succeeded");
    expect(processRunner.calls).toHaveLength(1);
    expect(processRunner.calls[0].command).toBe("codex");
    expect(processRunner.calls[0].args).toContain("exec");
    expect(processRunner.calls[0].args).toContain("--json");
    expect(processRunner.calls[0].args).toContain("--agent");
    expect(processRunner.calls[0].args).toContain("helper");
    expect(processRunner.calls[0].args).toContain("Fix: Repair auth");
    expect(fs.snapshot()["/project/.codex/agents/helper.toml"]).toContain(
      'name = "helper"',
    );
  });

  it("returns failed completion for nonzero codex exit codes", async () => {
    const fixture = await dispatchFixture();
    const adapter = new CodexAdapter({
      fs: new MemoryCodexFileSystem(),
      projectRoot: "/project",
      force: true,
    });
    const executor = new CodexExecStepExecutor({
      projectRoot: "/project",
      capabilityProvider: new StaticCodexNativeCapabilityProvider({
        canExecuteCustomAgent: true,
        selectorFlag: "--agent",
        source: "injected",
        detail: "test",
      }),
      processRunner: new MockProcessRunner({
        exitCode: 2,
        stdout: JSON.stringify({ message: "raw completion" }),
        stderr: "raw stderr",
      }),
    });

    const result = await executor.execute({
      effect: fixture.dispatch,
      stepName: fixture.stepName,
      workflowConfig: CONFIG.workflows["one-step"],
      workflowInstanceId: fixture.workflowInstanceId,
      store: fixture.store,
      adapter,
    });

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.status).toBe("failed");
    expect(value.completionSignal.outcome).toBe("failed");
    expect(value.completionSignal.message).not.toContain("raw stderr");
  });

  it("keeps raw codex output out of runtime journal data", async () => {
    const fixture = await dispatchFixture();
    const adapter = new CodexAdapter({
      fs: new MemoryCodexFileSystem(),
      projectRoot: "/project",
      force: true,
    });
    const executor = new CodexExecStepExecutor({
      projectRoot: "/project",
      capabilityProvider: new StaticCodexNativeCapabilityProvider({
        canExecuteCustomAgent: true,
        selectorFlag: "--agent",
        source: "injected",
        detail: "test",
      }),
      processRunner: new MockProcessRunner({
        exitCode: 0,
        stdout: JSON.stringify({ message: "raw completion" }),
        stderr: "raw stderr",
      }),
    });
    const execution = await executor.execute({
      effect: fixture.dispatch,
      stepName: fixture.stepName,
      workflowConfig: CONFIG.workflows["one-step"],
      workflowInstanceId: fixture.workflowInstanceId,
      store: fixture.store,
      adapter,
    });
    expect(execution.isOk()).toBe(true);
    await completeStep(
      {
        workflowInstanceId: fixture.workflowInstanceId,
        leaseId: fixture.leaseId,
        stepName: fixture.stepName,
        completionSignal: execution._unsafeUnwrap().completionSignal,
        context: fixture.context,
      },
      fixture.store,
    );

    const entries = await fixture.store.journal.query({});
    expect(entries.isOk()).toBe(true);
    const journal = entries
      ._unsafeUnwrap()
      .map((entry) => JSON.stringify(entry.data))
      .join("\n");
    expect(journal).not.toContain("raw completion");
    expect(journal).not.toContain("raw stderr");
  });

  it("fails before codex exec when native agent execution is unavailable", async () => {
    const fixture = await dispatchFixture();
    const processRunner = new MockProcessRunner({
      exitCode: 0,
      stdout: JSON.stringify({ message: "unused" }),
      stderr: "",
    });
    const executor = new CodexExecStepExecutor({
      projectRoot: "/project",
      processRunner,
      capabilityProvider: new StaticCodexNativeCapabilityProvider({
        canExecuteCustomAgent: false,
        selectorFlag: undefined,
        source: "help",
        detail: "no selector",
      }),
    });

    const result = await executor.execute({
      effect: fixture.dispatch,
      stepName: fixture.stepName,
      workflowConfig: CONFIG.workflows["one-step"],
      workflowInstanceId: fixture.workflowInstanceId,
      store: fixture.store,
      adapter: new CodexAdapter({
        fs: new MemoryCodexFileSystem(),
        projectRoot: "/project",
        force: true,
      }),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe(
      "NativeAgentExecutionUnavailable",
    );
    expect(processRunner.calls).toHaveLength(0);
  });
});
