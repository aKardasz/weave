import type { WeaveConfig, WorkflowConfig, WorkflowStep } from "@weave/core";
import type { RuntimeStore, RuntimeStoreError } from "@weave/engine";
import {
  completeStep,
  createInMemoryRuntimeStore,
  createWorkflowInstanceId,
  type DispatchAgentEffect,
  dispatchStep,
  type ExecutionLeaseId,
  type LifecycleEffect,
  type LifecycleError,
  logger,
  type PlanStateProvider,
  startExecution,
  type WorkflowExecutionContext,
  type WorkflowInstanceId,
} from "@weave/engine";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";

import type { CodexAdapter } from "./adapter.js";
import {
  CodexExecStepExecutor,
  type CodexStepExecutionError,
  type CodexStepExecutionResult,
  type CodexStepExecutor,
} from "./step-executor.js";

const log = logger.child({ module: "adapter-codex/run-workflow" });

export type CodexWorkflowRuntimeError =
  | { readonly type: "LifecycleError"; readonly cause: LifecycleError }
  | { readonly type: "WorkflowNotFound"; readonly workflowName: string }
  | { readonly type: "MaxStepsExceeded"; readonly maxSteps: number }
  | { readonly type: "RuntimeStoreError"; readonly cause: RuntimeStoreError }
  | {
      readonly type: "CodexStepExecutionError";
      readonly cause: CodexStepExecutionError;
    };

export interface CodexWorkflowRunnerOptions {
  readonly config: WeaveConfig;
  readonly workflowName: string;
  readonly goal: string;
  readonly slug: string;
  readonly adapter: CodexAdapter;
  readonly store?: RuntimeStore;
  readonly planStateProvider?: PlanStateProvider;
  readonly ownerId?: string;
  readonly maxSteps?: number;
  readonly stepExecutor?: CodexStepExecutor;
}

export interface CodexWorkflowRunResult {
  readonly workflowInstanceId: string;
  readonly appliedEffects: readonly LifecycleEffect[];
  readonly status: "completed" | "paused" | "failed";
  readonly stepsDispatched: number;
}

interface LoopState {
  readonly workflowInstanceId: WorkflowInstanceId;
  readonly leaseId: ExecutionLeaseId;
  readonly context: WorkflowExecutionContext;
  readonly workflowConfig: WorkflowConfig;
  readonly adapter: CodexAdapter;
  readonly stepExecutor: CodexStepExecutor;
  readonly planStateProvider: PlanStateProvider | undefined;
  readonly store: RuntimeStore;
  readonly appliedEffects: LifecycleEffect[];
  stepsDispatched: number;
  readonly maxSteps: number;
}

export class CodexWorkflowRunner {
  constructor(private readonly options: CodexWorkflowRunnerOptions) {}

  run(): ResultAsync<CodexWorkflowRunResult, CodexWorkflowRuntimeError> {
    return runCodexWorkflow(this.options);
  }
}

function resolveNextStepName(
  workflowConfig: WorkflowConfig,
  completedStepName: string,
): string | undefined {
  const currentIndex = workflowConfig.steps.findIndex(
    (step: WorkflowStep) => step.name === completedStepName,
  );
  if (currentIndex < 0) return undefined;
  return workflowConfig.steps[currentIndex + 1]?.name;
}

function appendJournal(input: {
  readonly store: RuntimeStore;
  readonly workflowInstanceId: WorkflowInstanceId;
  readonly leaseId?: ExecutionLeaseId;
  readonly stepName?: string;
  readonly eventType: string;
  readonly severity?: "debug" | "info" | "warn" | "error";
  readonly data?: Record<string, string | number | boolean>;
}): ResultAsync<void, CodexWorkflowRuntimeError> {
  return input.store.journal
    .append({
      source: { kind: "adapter", name: "adapter-codex" },
      eventType: input.eventType,
      workflowInstanceId: input.workflowInstanceId,
      ...(input.leaseId !== undefined ? { executionId: input.leaseId } : {}),
      ...(input.stepName !== undefined ? { stepId: input.stepName } : {}),
      severity: input.severity ?? "info",
      data: input.data ?? {},
    })
    .map(() => undefined)
    .mapErr(
      (cause): CodexWorkflowRuntimeError => ({
        type: "RuntimeStoreError",
        cause,
      }),
    );
}

function executeDispatchAgentEffect(
  effect: DispatchAgentEffect,
  state: LoopState,
  stepName: string,
): ResultAsync<CodexStepExecutionResult, CodexWorkflowRuntimeError> {
  log.info(
    {
      agentName: effect.runAgent.agentName,
      stepType: effect.runAgent.stepType,
      completionMethod: effect.runAgent.completionMethod,
    },
    "Executing Codex DispatchAgentEffect",
  );

  return state.stepExecutor
    .execute({
      effect,
      stepName,
      workflowConfig: state.workflowConfig,
      workflowInstanceId: state.workflowInstanceId,
      store: state.store,
      adapter: state.adapter,
    })
    .mapErr(
      (cause): CodexWorkflowRuntimeError => ({
        type: "CodexStepExecutionError",
        cause,
      }),
    )
    .andThen((executionResult) =>
      appendJournal({
        store: state.store,
        workflowInstanceId: state.workflowInstanceId,
        leaseId: state.leaseId,
        stepName,
        eventType: "codex.agent.executed",
        data: {
          agentName: effect.runAgent.agentName,
          stepType: effect.runAgent.stepType ?? "unknown",
          completionMethod: effect.runAgent.completionMethod ?? "unknown",
          status: executionResult.status,
          eventCount: executionResult.parsedEvents?.eventCount ?? 0,
          ...(executionResult.exitCode !== undefined
            ? { exitCode: executionResult.exitCode }
            : {}),
          ...(executionResult.parsedEvents?.usage?.totalTokens !== undefined
            ? {
                totalTokens: executionResult.parsedEvents.usage.totalTokens,
              }
            : {}),
        },
      }).map(() => executionResult),
    );
}

function firstDispatchEffect(
  effects: readonly LifecycleEffect[],
  stepName: string,
): ResultAsync<DispatchAgentEffect, CodexWorkflowRuntimeError> {
  const dispatch = effects.find(
    (effect): effect is DispatchAgentEffect => effect.kind === "dispatch-agent",
  );
  if (dispatch !== undefined) return okAsync(dispatch);
  return errAsync({
    type: "LifecycleError",
    cause: {
      type: "policy_decision",
      message: `No dispatch-agent effect was emitted for step "${stepName}".`,
    },
  });
}

function completeAndAdvance(
  stepName: string,
  state: LoopState,
  executionResult: CodexStepExecutionResult,
): ResultAsync<CodexWorkflowRunResult, CodexWorkflowRuntimeError> {
  return completeStep(
    {
      workflowInstanceId: state.workflowInstanceId,
      leaseId: state.leaseId,
      stepName,
      completionSignal: executionResult.completionSignal,
      context: state.context,
      planStateProvider: state.planStateProvider,
    },
    state.store,
  )
    .mapErr(
      (cause): CodexWorkflowRuntimeError => ({ type: "LifecycleError", cause }),
    )
    .andThen(({ effects: completionEffects }) => {
      for (const effect of completionEffects) {
        state.appliedEffects.push(effect);
      }

      return appendJournal({
        store: state.store,
        workflowInstanceId: state.workflowInstanceId,
        leaseId: state.leaseId,
        stepName,
        eventType: "codex.workflow.step.completed",
        data: {
          completionMethod:
            executionResult.completionSignal.method ?? "unknown",
          executionStatus: executionResult.status,
          effectCount: completionEffects.length,
        },
      }).andThen(() => {
        const pauseEffect = completionEffects.find(
          (effect) => effect.kind === "pause-execution",
        );
        if (pauseEffect !== undefined) {
          return appendJournal({
            store: state.store,
            workflowInstanceId: state.workflowInstanceId,
            leaseId: state.leaseId,
            eventType: "codex.workflow.paused",
            data: {
              workflowName: state.context.workflowName,
              stepsDispatched: state.stepsDispatched,
            },
          }).map(
            (): CodexWorkflowRunResult => ({
              workflowInstanceId: state.workflowInstanceId,
              appliedEffects: state.appliedEffects,
              status: "paused",
              stepsDispatched: state.stepsDispatched,
            }),
          );
        }

        const completeEffect = completionEffects.find(
          (effect) => effect.kind === "complete-execution",
        );
        if (completeEffect !== undefined) {
          if (executionResult.completionSignal.outcome === "failed") {
            return appendJournal({
              store: state.store,
              workflowInstanceId: state.workflowInstanceId,
              leaseId: state.leaseId,
              eventType: "codex.workflow.failed",
              severity: "error",
              data: {
                workflowName: state.context.workflowName,
                stepsDispatched: state.stepsDispatched,
              },
            }).map(
              (): CodexWorkflowRunResult => ({
                workflowInstanceId: state.workflowInstanceId,
                appliedEffects: state.appliedEffects,
                status: "failed",
                stepsDispatched: state.stepsDispatched,
              }),
            );
          }

          return appendJournal({
            store: state.store,
            workflowInstanceId: state.workflowInstanceId,
            leaseId: state.leaseId,
            eventType: "codex.workflow.completed",
            data: {
              workflowName: state.context.workflowName,
              stepsDispatched: state.stepsDispatched,
            },
          }).map(
            (): CodexWorkflowRunResult => ({
              workflowInstanceId: state.workflowInstanceId,
              appliedEffects: state.appliedEffects,
              status: "completed",
              stepsDispatched: state.stepsDispatched,
            }),
          );
        }

        const nextDispatch = completionEffects.find(
          (effect): effect is DispatchAgentEffect =>
            effect.kind === "dispatch-agent",
        );

        if (nextDispatch === undefined && executionResult.status === "failed") {
          return appendJournal({
            store: state.store,
            workflowInstanceId: state.workflowInstanceId,
            leaseId: state.leaseId,
            eventType: "codex.workflow.failed",
            severity: "error",
            data: {
              workflowName: state.context.workflowName,
              stepsDispatched: state.stepsDispatched,
            },
          }).map(
            (): CodexWorkflowRunResult => ({
              workflowInstanceId: state.workflowInstanceId,
              appliedEffects: state.appliedEffects,
              status: "failed",
              stepsDispatched: state.stepsDispatched,
            }),
          );
        }

        if (nextDispatch === undefined) {
          log.warn(
            {
              stepName,
              completionEffects: completionEffects.map((effect) => effect.kind),
            },
            "completeStep returned no terminal or advance effect",
          );
          return okAsync<CodexWorkflowRunResult, CodexWorkflowRuntimeError>({
            workflowInstanceId: state.workflowInstanceId,
            appliedEffects: state.appliedEffects,
            status: "completed",
            stepsDispatched: state.stepsDispatched,
          });
        }

        if (state.stepsDispatched >= state.maxSteps) {
          return errAsync<CodexWorkflowRunResult, CodexWorkflowRuntimeError>({
            type: "MaxStepsExceeded",
            maxSteps: state.maxSteps,
          });
        }

        state.stepsDispatched += 1;
        const isReviewRetry =
          executionResult.completionSignal.method === "review_verdict" &&
          executionResult.completionSignal.approved === false;
        const nextStepName = isReviewRetry
          ? stepName
          : resolveNextStepName(state.workflowConfig, stepName);
        if (nextStepName === undefined) {
          log.warn(
            { stepName },
            "dispatch-agent effect emitted but no next step was found",
          );
          return okAsync<CodexWorkflowRunResult, CodexWorkflowRuntimeError>({
            workflowInstanceId: state.workflowInstanceId,
            appliedEffects: state.appliedEffects,
            status: "completed",
            stepsDispatched: state.stepsDispatched,
          });
        }

        return appendJournal({
          store: state.store,
          workflowInstanceId: state.workflowInstanceId,
          leaseId: state.leaseId,
          stepName: nextStepName,
          eventType: "codex.workflow.step.dispatched",
          data: {
            agentName: nextDispatch.runAgent.agentName,
            stepsDispatched: state.stepsDispatched,
          },
        })
          .andThen(() =>
            executeDispatchAgentEffect(nextDispatch, state, nextStepName),
          )
          .andThen((nextExecutionResult) =>
            completeAndAdvance(nextStepName, state, nextExecutionResult),
          );
      });
    });
}

export function runCodexWorkflow(
  input: CodexWorkflowRunnerOptions,
): ResultAsync<CodexWorkflowRunResult, CodexWorkflowRuntimeError> {
  const {
    config,
    workflowName,
    goal,
    slug,
    adapter,
    planStateProvider,
    ownerId = "codex-run-workflow",
    maxSteps = 100,
  } = input;
  const store = input.store ?? createInMemoryRuntimeStore();
  const stepExecutor =
    input.stepExecutor ??
    new CodexExecStepExecutor({ projectRoot: adapter.projectRootPath });

  if (maxSteps < 1) {
    return errAsync({ type: "MaxStepsExceeded", maxSteps });
  }

  const workflowConfig = config.workflows[workflowName];
  if (workflowConfig === undefined) {
    return errAsync({ type: "WorkflowNotFound", workflowName });
  }

  const workflowInstanceId = createWorkflowInstanceId(crypto.randomUUID());
  const context: WorkflowExecutionContext = {
    workflowName,
    goal,
    slug,
    workflows: config.workflows,
  };

  log.info(
    { workflowName, goal, slug, workflowInstanceId },
    "Starting Codex workflow execution",
  );

  return startExecution(
    {
      workflowInstanceId,
      ownerId,
      context,
    },
    store,
  )
    .mapErr(
      (cause): CodexWorkflowRuntimeError => ({ type: "LifecycleError", cause }),
    )
    .andThen(({ leaseId }) =>
      appendJournal({
        store,
        workflowInstanceId,
        leaseId,
        eventType: "codex.workflow.started",
        data: { workflowName, slug },
      }).map(() => leaseId),
    )
    .andThen((leaseId) => {
      const appliedEffects: LifecycleEffect[] = [];
      const state: LoopState = {
        workflowInstanceId,
        leaseId,
        context,
        workflowConfig,
        adapter,
        stepExecutor,
        planStateProvider,
        store,
        appliedEffects,
        stepsDispatched: 0,
        maxSteps,
      };

      return dispatchStep(
        {
          workflowInstanceId,
          leaseId,
          context,
        },
        store,
      )
        .mapErr(
          (cause): CodexWorkflowRuntimeError => ({
            type: "LifecycleError",
            cause,
          }),
        )
        .andThen(({ stepName, effects }) => {
          state.stepsDispatched += 1;
          for (const effect of effects) {
            appliedEffects.push(effect);
          }

          const dispatchEffectCount = effects.filter(
            (effect): effect is DispatchAgentEffect =>
              effect.kind === "dispatch-agent",
          ).length;

          return appendJournal({
            store,
            workflowInstanceId,
            leaseId,
            stepName,
            eventType: "codex.workflow.step.dispatched",
            data: {
              effectCount: effects.length,
              dispatchEffectCount,
              stepsDispatched: state.stepsDispatched,
            },
          })
            .andThen(() => firstDispatchEffect(effects, stepName))
            .andThen((dispatchEffect) =>
              executeDispatchAgentEffect(dispatchEffect, state, stepName),
            )
            .andThen((executionResult) =>
              completeAndAdvance(stepName, state, executionResult),
            );
        });
    });
}
