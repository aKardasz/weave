import type { AgentDescriptor, ModelResolutionInput } from "@weave/engine";
import { resolveAdapterModelIntent } from "@weave/engine";

export interface CodexModelContext {
  availableModels?: Set<string>;
  uiSelectedModel?: string;
  systemDefault?: string;
  overrideModel?: string;
}

export function resolveCodexModelForAgent(
  descriptor: AgentDescriptor,
  context: CodexModelContext = {},
): string | undefined {
  const input: ModelResolutionInput = {
    agentName: descriptor.name,
    agentMode: descriptor.mode,
    agentModels: descriptor.models.length > 0 ? descriptor.models : undefined,
    uiSelectedModel: context.uiSelectedModel,
    systemDefault: context.systemDefault,
    overrideModel: context.overrideModel,
    availableModels: context.availableModels,
  };

  const resolved = resolveAdapterModelIntent(input);
  return resolved.model;
}
