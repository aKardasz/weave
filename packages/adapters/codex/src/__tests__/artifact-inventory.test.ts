import { describe, expect, it } from "bun:test";
import { inventoryCodexArtifacts, MemoryCodexFileSystem } from "../index.js";

describe("inventoryCodexArtifacts", () => {
  it("reports stale owned generated agents without deleting by default", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.codex/agents/current.toml": "# weave-managed\n",
      "/project/.codex/agents/stale.toml": "# weave-managed\n",
    });

    const result = await inventoryCodexArtifacts({
      fs,
      projectRoot: "/project",
      currentAgentNames: ["current"],
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.staleOwned).toContain("/project/.codex/agents/stale.toml");
    expect(output.deleted).toHaveLength(0);
    expect(fs.snapshot()["/project/.codex/agents/stale.toml"]).toBeDefined();
  });

  it("deletes only stale owned generated agents when prune is enabled", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.codex/agents/current.toml": "# weave-managed\n",
      "/project/.codex/agents/stale.toml": "# weave-managed\n",
      "/project/.codex/agents/foreign.toml": "manual\n",
    });

    const result = await inventoryCodexArtifacts({
      fs,
      projectRoot: "/project",
      currentAgentNames: ["current"],
      prune: true,
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.deleted).toEqual(["/project/.codex/agents/stale.toml"]);
    expect(fs.snapshot()["/project/.codex/agents/current.toml"]).toBeDefined();
    expect(fs.snapshot()["/project/.codex/agents/foreign.toml"]).toBeDefined();
    expect(fs.snapshot()["/project/.codex/agents/stale.toml"]).toBeUndefined();
  });

  it("reports collisions for expected foreign artifacts", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.agents/plugins/marketplace.json": "{}",
    });

    const result = await inventoryCodexArtifacts({
      fs,
      projectRoot: "/project",
      currentAgentNames: [],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().collisions[0]?.type).toBe(
      "CodexArtifactCollision",
    );
  });
});
