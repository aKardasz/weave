import { describe, expect, it } from "bun:test";
import { parseCodexExecHelpForNativeAgentCapability } from "../index.js";

describe("parseCodexExecHelpForNativeAgentCapability", () => {
  it("detects unsupported native custom-agent execution", () => {
    const capability = parseCodexExecHelpForNativeAgentCapability(
      "Usage: codex exec [OPTIONS] [PROMPT]\n  --json",
    );

    expect(capability.canExecuteCustomAgent).toBe(false);
    expect(capability.selectorFlag).toBeUndefined();
  });

  it("detects --agent selector support", () => {
    const capability = parseCodexExecHelpForNativeAgentCapability(
      "Options:\n  --agent <AGENT>\n",
    );

    expect(capability.canExecuteCustomAgent).toBe(true);
    expect(capability.selectorFlag).toBe("--agent");
  });
});
