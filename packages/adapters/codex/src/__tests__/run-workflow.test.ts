import { describe, expect, it } from "bun:test";
import type { WeaveConfig } from "@weave/core";
import { createInMemoryRuntimeStore } from "@weave/engine";
import { okAsync } from "neverthrow";

import {
  CodexAdapter,
  CodexExecStepExecutor,
  type CodexProcessRunError,
  type CodexProcessRunner,
  type CodexProcessRunResult,
  type CodexStepExecutionInput,
  type CodexStepExecutionResult,
  type CodexStepExecutor,
  MemoryCodexFileSystem,
  StaticCodexNativeCapabilityProvider,
} from "../index.js";
import { CodexWorkflowRunner, runCodexWorkflow } from "../run-workflow.js";

const TWO_STEP_CONFIG: WeaveConfig = {
  agents: {
    shuttle: {
      description: "Shuttle (Domain Specialist)",
      prompt: "You are a domain specialist.",
      models: ["gpt-5"],
      mode: "subagent",
      temperature: 0.2,
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
    "plan-and-execute": {
      description: "Plan then execute a task",
      version: 1,
      steps: [
        {
          name: "plan",
          display_name: "Create implementation plan",
          type: "autonomous",
          agent: "shuttle",
          prompt: "Create a plan for: {{instance.goal}}",
          completion: { method: "agent_signal" },
        },
        {
          name: "execute",
          display_name: "Execute the plan",
          type: "autonomous",
          agent: "shuttle",
          prompt: "Execute the plan for: {{instance.goal}}",
          completion: { method: "agent_signal" },
        },
      ],
    },
  },
};

const REVIEW_WORKFLOW_CONFIG: WeaveConfig = {
  agents: {
    reviewer: {
      description: "Reviewer",
      prompt: "You review changes.",
      mode: "subagent",
      tool_policy: {
        read: "allow",
        write: "deny",
        execute: "deny",
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
    pause: {
      version: 1,
      steps: [
        {
          name: "review",
          type: "gate",
          agent: "reviewer",
          prompt: "Review: {{instance.goal}}",
          completion: { method: "review_verdict" },
          on_reject: "pause",
        },
      ],
    },
    fail: {
      version: 1,
      steps: [
        {
          name: "review",
          type: "gate",
          agent: "reviewer",
          prompt: "Review: {{instance.goal}}",
          completion: { method: "review_verdict" },
          on_reject: "fail",
        },
      ],
    },
    retry: {
      version: 1,
      steps: [
        {
          name: "review",
          type: "gate",
          agent: "reviewer",
          prompt: "Review: {{instance.goal}}",
          completion: { method: "review_verdict" },
          on_reject: "retry",
        },
      ],
    },
  },
};

function createAdapter(fs = new MemoryCodexFileSystem()): CodexAdapter {
  return new CodexAdapter({ fs, projectRoot: "/project", force: true });
}

class MockStepExecutor implements CodexStepExecutor {
  readonly calls: CodexStepExecutionInput[] = [];

  constructor(private readonly exitCodes: number[] = []) {}

  execute(input: CodexStepExecutionInput) {
    this.calls.push(input);
    const exitCode = this.exitCodes.shift() ?? 0;
    if (exitCode !== 0) {
      return okAsync({
        completionSignal: {
          outcome: "failed",
          method: input.effect.runAgent.completionMethod,
          message: `Codex exec failed for step "${input.stepName}" with exit ${exitCode}.`,
        },
        exitCode,
        status: "failed",
        message: `Codex exec failed for step "${input.stepName}" with exit ${exitCode}.`,
      } satisfies CodexStepExecutionResult);
    }

    return okAsync({
      completionSignal: {
        outcome: "success",
        method: input.effect.runAgent.completionMethod,
        message: `Codex exec completed step "${input.stepName}" successfully.`,
      },
      exitCode,
      status: "succeeded",
      message: `Codex exec completed step "${input.stepName}" successfully.`,
    } satisfies CodexStepExecutionResult);
  }
}

class ReviewStepExecutor implements CodexStepExecutor {
  readonly calls: CodexStepExecutionInput[] = [];

  constructor(private readonly approvals: boolean[]) {}

  execute(input: CodexStepExecutionInput) {
    this.calls.push(input);
    const approved = this.approvals.shift() ?? true;
    return okAsync({
      completionSignal: {
        outcome: approved ? "success" : "failed",
        method: "review_verdict",
        approved,
        message: approved ? "approved" : "rejected",
      },
      exitCode: 0,
      status: approved ? "succeeded" : "failed",
      message: approved ? "approved" : "rejected",
    } satisfies CodexStepExecutionResult);
  }
}

class MockProcessRunner implements CodexProcessRunner {
  run(
    _command: string,
    _args: readonly string[],
  ): import("neverthrow").ResultAsync<
    CodexProcessRunResult,
    CodexProcessRunError
  > {
    return okAsync({
      exitCode: 0,
      stdout: JSON.stringify({ message: "raw completion" }),
      stderr: "",
    });
  }
}

function nativeProvider(): StaticCodexNativeCapabilityProvider {
  return new StaticCodexNativeCapabilityProvider({
    canExecuteCustomAgent: true,
    selectorFlag: "--agent",
    source: "injected",
    detail: "test",
  });
}

describe("runCodexWorkflow", () => {
  it("returns WorkflowNotFound for unknown workflow names", async () => {
    const result = await runCodexWorkflow({
      config: TWO_STEP_CONFIG,
      workflowName: "missing",
      goal: "Build a feature",
      slug: "build-a-feature",
      adapter: createAdapter(),
      store: createInMemoryRuntimeStore(),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("WorkflowNotFound");
  });

  it("materializes Codex agent TOML for dispatched workflow steps", async () => {
    const fs = new MemoryCodexFileSystem();
    const adapter = createAdapter(fs);
    const store = createInMemoryRuntimeStore();
    const stepExecutor = new CodexExecStepExecutor({
      projectRoot: "/project",
      processRunner: new MockProcessRunner(),
      capabilityProvider: nativeProvider(),
    });

    const result = await runCodexWorkflow({
      config: TWO_STEP_CONFIG,
      workflowName: "plan-and-execute",
      goal: "Build a feature",
      slug: "build-a-feature",
      adapter,
      store,
      stepExecutor,
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.status).toBe("completed");
    expect(output.stepsDispatched).toBe(2);
    expect(adapter.writtenAgents.get("shuttle")).toBe(
      "/project/.codex/agents/shuttle.toml",
    );
    expect(fs.snapshot()["/project/.codex/agents/shuttle.toml"]).toContain(
      'name = "shuttle"',
    );
  });

  it("persists Codex adapter runtime journal entries", async () => {
    const store = createInMemoryRuntimeStore();
    const stepExecutor = new MockStepExecutor();

    const result = await new CodexWorkflowRunner({
      config: TWO_STEP_CONFIG,
      workflowName: "plan-and-execute",
      goal: "Journal the run",
      slug: "journal-the-run",
      adapter: createAdapter(),
      store,
      stepExecutor,
    }).run();

    expect(result.isOk()).toBe(true);
    const entries = await store.journal.query({ sourceName: "adapter-codex" });

    expect(entries.isOk()).toBe(true);
    const eventTypes = entries._unsafeUnwrap().map((entry) => entry.eventType);
    expect(eventTypes).toContain("codex.workflow.started");
    expect(eventTypes).toContain("codex.workflow.step.dispatched");
    expect(eventTypes).toContain("codex.agent.executed");
    expect(eventTypes).toContain("codex.workflow.completed");
  });

  it("marks the workflow failed when Codex exec fails", async () => {
    const store = createInMemoryRuntimeStore();

    const result = await runCodexWorkflow({
      config: TWO_STEP_CONFIG,
      workflowName: "plan-and-execute",
      goal: "Build a feature",
      slug: "build-a-feature",
      adapter: createAdapter(),
      store,
      stepExecutor: new MockStepExecutor([1]),
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.status).toBe("failed");
    expect(output.stepsDispatched).toBe(1);
    const entries = await store.journal.query({ sourceName: "adapter-codex" });
    expect(entries.isOk()).toBe(true);
    const serializedData = entries
      ._unsafeUnwrap()
      .map((entry) => JSON.stringify(entry.data))
      .join("\n");
    expect(serializedData).not.toContain("Create a plan");
    expect(serializedData).not.toContain("raw completion");
  });

  it("honors the max step guard", async () => {
    const result = await runCodexWorkflow({
      config: TWO_STEP_CONFIG,
      workflowName: "plan-and-execute",
      goal: "Build a feature",
      slug: "build-a-feature",
      adapter: createAdapter(),
      store: createInMemoryRuntimeStore(),
      maxSteps: 1,
      stepExecutor: new MockStepExecutor(),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("MaxStepsExceeded");
  });

  it("pauses when review_verdict rejects with on_reject pause", async () => {
    const stepExecutor = new ReviewStepExecutor([false]);

    const result = await runCodexWorkflow({
      config: REVIEW_WORKFLOW_CONFIG,
      workflowName: "pause",
      goal: "Review a patch",
      slug: "review-a-patch",
      adapter: createAdapter(),
      store: createInMemoryRuntimeStore(),
      stepExecutor,
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.status).toBe("paused");
    expect(output.appliedEffects.map((effect) => effect.kind)).toContain(
      "pause-execution",
    );
  });

  it("fails when review_verdict rejects with on_reject fail", async () => {
    const result = await runCodexWorkflow({
      config: REVIEW_WORKFLOW_CONFIG,
      workflowName: "fail",
      goal: "Review a patch",
      slug: "review-a-patch",
      adapter: createAdapter(),
      store: createInMemoryRuntimeStore(),
      stepExecutor: new ReviewStepExecutor([false]),
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.status).toBe("failed");
    expect(output.appliedEffects.map((effect) => effect.kind)).toContain(
      "complete-execution",
    );
  });

  it("retries the same review_verdict step before completing", async () => {
    const stepExecutor = new ReviewStepExecutor([false, true]);

    const result = await runCodexWorkflow({
      config: REVIEW_WORKFLOW_CONFIG,
      workflowName: "retry",
      goal: "Review a patch",
      slug: "review-a-patch",
      adapter: createAdapter(),
      store: createInMemoryRuntimeStore(),
      stepExecutor,
      maxSteps: 3,
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.status).toBe("completed");
    expect(output.stepsDispatched).toBe(2);
    expect(stepExecutor.calls.map((call) => call.stepName)).toEqual([
      "review",
      "review",
    ]);
  });
});
