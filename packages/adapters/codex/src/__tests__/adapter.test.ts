import { describe, expect, it } from "bun:test";
import type { AgentDescriptor, EffectiveToolPolicy } from "@weave/engine";
import {
  CodexAdapter,
  type CodexAdapterError,
  MemoryCodexFileSystem,
} from "../index.js";

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
    name: "test-agent",
    description: "A test agent",
    composedPrompt: "You are a test agent.",
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

describe("CodexAdapter", () => {
  it("initializes plan state provider and writes plugin files", async () => {
    const fs = new MemoryCodexFileSystem();
    const adapter = new CodexAdapter({ fs, projectRoot: "/project" });

    await adapter.init();

    expect(adapter.planStateProvider).toBeDefined();
    const snapshot = fs.snapshot();
    expect(
      snapshot["/project/plugins/weave-codex/.codex-plugin/plugin.json"],
    ).toContain("weave-codex");
    expect(
      snapshot["/project/plugins/weave-codex/skills/weave/SKILL.md"],
    ).toContain("name: weave");
    expect(
      snapshot["/project/plugins/weave-codex/skills/weave/agents/openai.yaml"],
    ).toContain('display_name: "Weave"');
    expect(snapshot["/project/plugins/weave-codex/hooks.json"]).toContain(
      "SessionStart",
    );
    expect(snapshot["/project/plugins/weave-codex/.mcp.json"]).toContain(
      "weave-smoke",
    );
    expect(snapshot["/project/plugins/weave-codex/.app.json"]).toContain(
      "weave-smoke",
    );
    expect(snapshot["/project/.agents/plugins/marketplace.json"]).toContain(
      "weave-codex",
    );
  });

  it("writes managed Codex agent TOML", async () => {
    const fs = new MemoryCodexFileSystem();
    const adapter = new CodexAdapter({ fs, projectRoot: "/project" });

    await adapter.init();
    await adapter.spawnSubagent(makeDescriptor());

    const agent = fs.snapshot()["/project/.codex/agents/test-agent.toml"];
    expect(agent).toContain("# weave-managed");
    expect(agent).toContain('name = "test-agent"');
    expect(agent).toContain("You are a test agent.");
  });

  it("updates managed agent files", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.codex/agents/test-agent.toml": "# weave-managed\nold",
    });
    const adapter = new CodexAdapter({ fs, projectRoot: "/project" });

    await adapter.spawnSubagent(
      makeDescriptor({ composedPrompt: "New prompt" }),
    );

    expect(fs.snapshot()["/project/.codex/agents/test-agent.toml"]).toContain(
      "New prompt",
    );
  });

  it("fails closed on foreign agent files", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.codex/agents/test-agent.toml": 'name = "test-agent"\n',
    });
    const adapter = new CodexAdapter({ fs, projectRoot: "/project" });

    try {
      await adapter.spawnSubagent(makeDescriptor());
      throw new Error("Expected spawnSubagent to fail");
    } catch (cause) {
      const error = cause as CodexAdapterError;
      expect(error.type).toBe("WriteAgentError");
      expect(error.message).toContain("Refusing to overwrite");
    }
  });

  it("returns injected skills without discovery", async () => {
    const adapter = new CodexAdapter({
      availableSkills: [
        { name: "weave", metadata: { description: "Injected" } },
      ],
    });

    const skills = await adapter.loadAvailableSkills();

    expect(skills).toEqual([
      { name: "weave", metadata: { description: "Injected" } },
    ]);
  });
});
