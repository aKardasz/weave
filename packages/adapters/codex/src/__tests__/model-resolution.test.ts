import { describe, expect, it } from "bun:test";
import type { AgentDescriptor, EffectiveToolPolicy } from "@weave/engine";
import { resolveCodexModelForAgent } from "../index.js";

const policy: EffectiveToolPolicy = {
  read: "allow",
  write: "allow",
  execute: "allow",
  delegate: "deny",
  network: "ask",
};

function descriptor(input: Partial<AgentDescriptor> = {}): AgentDescriptor {
  return {
    name: "helper",
    composedPrompt: "Help",
    models: ["gpt-5"],
    mode: "subagent",
    effectiveToolPolicy: policy,
    rawToolPolicy: undefined,
    delegationTargets: [],
    skills: [],
    ...input,
  };
}

describe("resolveCodexModelForAgent", () => {
  it("fails fast for unavailable explicit subagent model intent", () => {
    const result = resolveCodexModelForAgent(descriptor(), {
      availableModels: new Set(["gpt-4o"]),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("CodexModelNotAvailableError");
  });

  it("allows primary model fallback when explicit primary model is unavailable", () => {
    const result = resolveCodexModelForAgent(descriptor({ mode: "primary" }), {
      availableModels: new Set(["gpt-4o"]),
      systemDefault: "gpt-4o",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("gpt-4o");
  });
});
