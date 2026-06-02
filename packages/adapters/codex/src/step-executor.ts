import type { WorkflowConfig } from "@weave/core";
import type {
  DispatchAgentEffect,
  RuntimeStore,
  RuntimeStoreError,
  StepCompletionSignal,
  WorkflowInstanceId,
} from "@weave/engine";
import { renderWorkflowStepPrompt } from "@weave/engine";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { CodexAdapter } from "./adapter.js";
import {
  type CodexJsonEventParseError,
  type CodexParsedExecEvents,
  parseCodexExecJsonEvents,
} from "./exec-events.js";
import {
  CodexExecHelpCapabilityProvider,
  type CodexNativeAgentCapability,
  type CodexNativeCapabilityError,
  type CodexNativeCapabilityProvider,
} from "./native-capability.js";
import {
  BunCodexProcessRunner,
  type CodexProcessRunError,
  type CodexProcessRunner,
} from "./process-runner.js";

export type CodexStepExecutionError =
  | {
      readonly type: "WorkflowInstanceNotFound";
      readonly workflowInstanceId: string;
    }
  | { readonly type: "WorkflowStepNotFound"; readonly stepName: string }
  | { readonly type: "PromptRenderError"; readonly cause: unknown }
  | { readonly type: "RuntimeStoreError"; readonly cause: RuntimeStoreError }
  | {
      readonly type: "NativeAgentExecutionUnavailable";
      readonly agentName: string;
      readonly detail: string;
    }
  | {
      readonly type: "CodexNativeCapabilityError";
      readonly cause: CodexNativeCapabilityError;
    }
  | {
      readonly type: "CodexJsonEventParseError";
      readonly cause: CodexJsonEventParseError;
    };

export interface CodexStepExecutorOptions {
  readonly projectRoot: string;
  readonly processRunner?: CodexProcessRunner;
  readonly capabilityProvider?: CodexNativeCapabilityProvider;
}

export interface CodexStepExecutionInput {
  readonly effect: DispatchAgentEffect;
  readonly stepName: string;
  readonly workflowConfig: WorkflowConfig;
  readonly workflowInstanceId: WorkflowInstanceId;
  readonly store: RuntimeStore;
  readonly adapter: CodexAdapter;
}

export interface CodexStepExecutionResult {
  readonly completionSignal: StepCompletionSignal;
  readonly exitCode: number | undefined;
  readonly status: "succeeded" | "failed";
  readonly message: string;
  readonly parsedEvents?: CodexParsedExecEvents;
}

export interface CodexStepExecutor {
  execute(
    input: CodexStepExecutionInput,
  ): ResultAsync<CodexStepExecutionResult, CodexStepExecutionError>;
}

export class CodexExecStepExecutor implements CodexStepExecutor {
  private readonly projectRoot: string;
  private readonly processRunner: CodexProcessRunner;
  private readonly capabilityProvider: CodexNativeCapabilityProvider;

  constructor(options: CodexStepExecutorOptions) {
    this.projectRoot = options.projectRoot;
    this.processRunner = options.processRunner ?? new BunCodexProcessRunner();
    this.capabilityProvider =
      options.capabilityProvider ??
      new CodexExecHelpCapabilityProvider(this.processRunner);
  }

  execute(
    input: CodexStepExecutionInput,
  ): ResultAsync<CodexStepExecutionResult, CodexStepExecutionError> {
    const step = input.workflowConfig.steps.find(
      (candidate) => candidate.name === input.stepName,
    );
    if (step === undefined) {
      return errAsync({
        type: "WorkflowStepNotFound",
        stepName: input.stepName,
      });
    }

    return this.capabilityProvider
      .probe()
      .mapErr(
        (cause): CodexStepExecutionError => ({
          type: "CodexNativeCapabilityError",
          cause,
        }),
      )
      .andThen((capability) =>
        ensureNativeAgentExecution(capability, input.effect.runAgent.agentName),
      )
      .andThen((capability) =>
        ResultAsync.fromPromise(
          input.adapter.spawnSubagent(input.effect.runAgent.agentDescriptor),
          (cause): CodexStepExecutionError => ({
            type: "PromptRenderError",
            cause,
          }),
        ).map(() => capability),
      )
      .andThen((capability) =>
        input.store.instances
          .getById(input.workflowInstanceId)
          .mapErr(
            (cause): CodexStepExecutionError => ({
              type: "RuntimeStoreError",
              cause,
            }),
          )
          .map((instance) => ({ instance, capability })),
      )
      .andThen(({ instance, capability }) => {
        const prompt = renderWorkflowStepPrompt({ instance, step });
        if (prompt.isErr()) {
          return errAsync<CodexStepExecutionResult, CodexStepExecutionError>({
            type: "PromptRenderError",
            cause: prompt.error,
          });
        }

        return this.processRunner
          .run(
            "codex",
            buildCodexExecArgs({
              projectRoot: this.projectRoot,
              prompt: prompt.value,
              agentName: input.effect.runAgent.agentName,
              selectorFlag: capability.selectorFlag ?? "--agent",
            }),
            { cwd: this.projectRoot },
          )
          .orElse((cause) =>
            okAsync(processRunFailureResult(cause, step.completion.method)),
          )
          .andThen((result) => {
            if ("completionSignal" in result) return okAsync(result);

            const parsed = parseCodexExecJsonEvents(result.stdout);
            if (parsed.isErr()) {
              return errAsync<
                CodexStepExecutionResult,
                CodexStepExecutionError
              >({ type: "CodexJsonEventParseError", cause: parsed.error });
            }

            return okAsync(
              toStepExecutionResult(
                result.exitCode,
                step.completion.method,
                input.stepName,
                parsed.value,
              ),
            );
          });
      });
  }
}

function ensureNativeAgentExecution(
  capability: CodexNativeAgentCapability,
  agentName: string,
): ResultAsync<CodexNativeAgentCapability, CodexStepExecutionError> {
  if (
    capability.canExecuteCustomAgent &&
    capability.selectorFlag !== undefined
  ) {
    return okAsync(capability);
  }

  return errAsync({
    type: "NativeAgentExecutionUnavailable",
    agentName,
    detail: capability.detail,
  });
}

function buildCodexExecArgs(input: {
  projectRoot: string;
  prompt: string;
  agentName: string;
  selectorFlag: "--agent" | "--custom-agent";
}): string[] {
  return [
    "exec",
    "--cd",
    input.projectRoot,
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--json",
    input.selectorFlag,
    input.agentName,
    "-c",
    "approval_policy=never",
    input.prompt,
  ];
}

function toStepExecutionResult(
  exitCode: number,
  method: StepCompletionSignal["method"],
  stepName: string,
  parsedEvents: CodexParsedExecEvents,
): CodexStepExecutionResult {
  if (exitCode !== 0) {
    return {
      exitCode,
      status: "failed",
      message: `Codex exec failed for step "${stepName}" with exit ${exitCode}.`,
      completionSignal: {
        outcome: "failed",
        method,
        message: `Codex exec failed for step "${stepName}" with exit ${exitCode}.`,
      },
    };
  }

  if (method === "review_verdict") {
    if (parsedEvents.reviewApproved !== undefined) {
      return {
        exitCode,
        status: parsedEvents.reviewApproved ? "succeeded" : "failed",
        message:
          parsedEvents.finalMessage ??
          `Codex review_verdict completed step "${stepName}".`,
        parsedEvents,
        completionSignal: {
          outcome: parsedEvents.reviewApproved ? "success" : "failed",
          method,
          approved: parsedEvents.reviewApproved,
          message:
            parsedEvents.finalMessage ??
            `Codex review_verdict completed step "${stepName}".`,
        },
      };
    }

    return {
      exitCode,
      status: "failed",
      message:
        "Codex review_verdict steps require an explicit parsed approval boolean; parsing is not implemented.",
      completionSignal: {
        outcome: "failed",
        method,
        approved: false,
        message:
          "Codex review_verdict steps require an explicit parsed approval boolean; parsing is not implemented.",
      },
    };
  }

  return {
    exitCode,
    status: "succeeded",
    message: `Codex exec completed step "${stepName}" successfully.`,
    parsedEvents,
    completionSignal: {
      outcome: "success",
      method,
      message: `Codex exec completed step "${stepName}" successfully.`,
    },
  };
}

function processRunFailureResult(
  cause: CodexProcessRunError,
  method: StepCompletionSignal["method"],
): CodexStepExecutionResult {
  return {
    exitCode: undefined,
    status: "failed",
    message: `Failed to launch ${cause.command}.`,
    completionSignal: {
      outcome: "failed",
      method,
      message: `Failed to launch ${cause.command}.`,
    },
  };
}
