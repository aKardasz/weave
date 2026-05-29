import { describe, expect, it } from "bun:test";
import { discoverCodexSkills, MemoryCodexFileSystem } from "../index.js";

describe("Codex skill discovery", () => {
  it("discovers repo-local weave skill metadata", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.agents/skills/weave/SKILL.md": [
        "---",
        "name: weave",
        "description: Weave coordination",
        "---",
        "",
      ].join("\n"),
    });

    const result = await discoverCodexSkills({ fs, projectRoot: "/project" });

    expect(result._unsafeUnwrap()).toMatchObject([
      {
        name: "weave",
        metadata: { description: "Weave coordination" },
      },
    ]);
  });

  it("returns an empty list when no known skill files exist", async () => {
    const fs = new MemoryCodexFileSystem();
    const result = await discoverCodexSkills({ fs, projectRoot: "/project" });

    expect(result._unsafeUnwrap()).toEqual([]);
  });
});
