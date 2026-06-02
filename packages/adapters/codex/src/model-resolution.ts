import type { AgentDescriptor, ModelResolutionInput } from "@weave/engine";
import { resolveAdapterModelIntent } from "@weave/engine";
import { err, ok, type Result } from "neverthrow";

export interface CodexModelContext {
  availableModels?: Set<string>;
  uiSelectedModel?: string;
  systemDefault?: string;
  overrideModel?: string;
}

export type CodexModelResolutionError = {
  readonly type: "CodexModelNotAvailableError";
  readonly agentName: string;
  readonly requestedModels: readonly string[];
  readonly availableModels: readonly string[];
  readonly message: string;
};

export function resolveCodexModelForAgent(
  descriptor: AgentDescriptor,
  context: CodexModelContext = {},
): Result<string | undefined, CodexModelResolutionError> {
  const input: ModelResolutionInput = {
    agentName: descriptor.name,
    agentMode: descriptor.mode,
    agentModels: descriptor.models.length > 0 ? descriptor.models : undefined,
    uiSelectedModel: context.uiSelectedModel,
    systemDefault: context.systemDefault,
    overrideModel: context.overrideModel,
    availableModels: context.availableModels,
  };

  if (
    descriptor.mode === "subagent" &&
    descriptor.models.length > 0 &&
    context.availableModels !== undefined
  ) {
    const firstDeclared = descriptor.models[0];
    if (
      firstDeclared !== undefined &&
      !context.availableModels.has(firstDeclared)
    ) {
      return err({
        type: "CodexModelNotAvailableError",
        agentName: descriptor.name,
        requestedModels: descriptor.models,
        availableModels: [...context.availableModels],
        message: `Agent "${descriptor.name}" declares model "${firstDeclared}" but it is not available in this Codex context.`,
      });
    }
  }

  const resolved = resolveAdapterModelIntent(input);
  return ok(resolved.model);
}
