import { describe, expect, it } from "bun:test";
import type { FileReader } from "@weave/config";
import { errAsync, okAsync } from "neverthrow";
import { MemoryCodexFileSystem, materializeCodexProject } from "../index.js";

function projectOnlyReader(files: Record<string, string>): FileReader {
  return {
    read(path: string) {
      const content = files[path];
      if (content === undefined) {
        return errAsync({
          type: "FileReadError" as const,
          path,
          cause: "missing",
        });
      }
      return okAsync(content);
    },
    exists(path: string) {
      return Promise.resolve(files[path] !== undefined);
    },
  };
}

describe("materializeCodexProject", () => {
  it("loads config and writes generated Codex artifacts", async () => {
    const fs = new MemoryCodexFileSystem();
    const fileReader = projectOnlyReader({
      "/project/.weave/config.weave": [
        "agent helper {",
        '  prompt "Help with this project."',
        "  mode subagent",
        "}",
      ].join("\n"),
    });

    const result = await materializeCodexProject({
      projectRoot: "/project",
      fileReader,
      adapterOptions: { fs },
    });

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.agentArtifacts).toHaveLength(value.agentCount);
    const helper = value.agentArtifacts.find(
      (agent) => agent.name === "helper",
    );
    expect(helper?.content).toContain("Help with this project.");
    expect(fs.snapshot()["/project/.codex/agents/helper.toml"]).toContain(
      "Help with this project.",
    );
    expect(
      fs.snapshot()["/project/.agents/plugins/marketplace.json"],
    ).toContain("weave-codex");
  });
});
