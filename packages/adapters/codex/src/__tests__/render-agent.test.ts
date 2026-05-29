import { describe, expect, it } from "bun:test";
import type { AgentDescriptor, EffectiveToolPolicy } from "@weave/engine";
import { safeCodexFileStem } from "../path-utils.js";
import { renderAgentToml, translateAgent } from "../render-agent.js";

const DEFAULT_TOOL_POLICY: EffectiveToolPolicy = {
  read: "allow",
  write: "allow",
  execute: "allow",
  delegate: "deny",
  network: "ask",
};

function makeDescriptor(
  overrides: Partial<AgentDescriptor> = {},
): AgentDescriptor {
  return {
    name: "reviewer",
    displayName: "Reviewer",
    description: "Reviews code",
    composedPrompt: "Review the diff.",
    models: ["gpt-5.5"],
    mode: "subagent",
    temperature: 0.2,
    rawToolPolicy: undefined,
    effectiveToolPolicy: DEFAULT_TOOL_POLICY,
    delegationTargets: [],
    skills: [],
    ...overrides,
  };
}

describe("Codex agent translation", () => {
  it("translates descriptor fields into Codex custom agent config", () => {
    const result = translateAgent(makeDescriptor(), "gpt-5.5");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value.name).toBe("reviewer");
    expect(result.value.description).toBe("Reviews code");
    expect(result.value.model).toBe("gpt-5.5");
    expect(result.value.nickname_candidates).toEqual(["Reviewer"]);
    expect(result.value.developer_instructions).toContain("Review the diff.");
    expect(result.value.developer_instructions).toContain("- delegate: deny");
  });

  it("uses read-only sandbox when write or execute policy is denied", () => {
    const result = translateAgent(
      makeDescriptor({
        effectiveToolPolicy: {
          ...DEFAULT_TOOL_POLICY,
          write: "deny",
        },
      }),
    );

    expect(result._unsafeUnwrap().sandbox_mode).toBe("read-only");
  });

  it("renders managed TOML with multiline instructions", () => {
    const toml = renderAgentToml({
      name: "reviewer",
      description: "Reviews code",
      developer_instructions: "Line one\nLine two",
      model: "gpt-5.5",
      sandbox_mode: "read-only",
      nickname_candidates: ["Reviewer"],
    });

    expect(toml).toContain("# weave-managed");
    expect(toml).toContain('name = "reviewer"');
    expect(toml).toContain('model = "gpt-5.5"');
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain('nickname_candidates = ["Reviewer"]');
    expect(toml).toContain('developer_instructions = """Line one');
  });

  it("generates safe file stems", () => {
    expect(safeCodexFileStem("Review Agent!")).toBe("review-agent");
    expect(safeCodexFileStem("")).toBe("agent");
  });
});
