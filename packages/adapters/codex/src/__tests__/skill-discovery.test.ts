import { describe, expect, it } from "bun:test";
import { errAsync, okAsync } from "neverthrow";
import {
  type CodexFileSystemError,
  discoverCodexSkills,
  MemoryCodexFileSystem,
} from "../index.js";

class MissingListFileSystem extends MemoryCodexFileSystem {
  override listFiles(path: string) {
    const resolved = this.resolvePath(path);
    const files = Object.keys(this.snapshot()).filter((file) =>
      file.startsWith(`${resolved}/`),
    );
    if (files.length > 0) return okAsync(files);

    return errAsync({
      type: "CodexFileSystemError",
      operation: "list",
      path: resolved,
      cause: {
        kind: "RuntimeFailure",
        message: `ENOENT: no such file or directory, open '${resolved}\\0'`,
      },
    } satisfies CodexFileSystemError);
  }
}

describe("Codex skill discovery", () => {
  it("discovers repo-local skill metadata", async () => {
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

  it("discovers project, parent, home, and plugin skills with name dedupe", async () => {
    const fs = new MemoryCodexFileSystem({
      "/project/.agents/skills/weave/SKILL.md": [
        "---",
        "name: weave",
        "description: Project wins",
        "---",
      ].join("\n"),
      "/project/.codex/skills/debug/SKILL.md": [
        "---",
        "name: debug",
        "description: Project debug",
        "---",
      ].join("\n"),
      "/project/plugins/weave-codex/skills/plugin-only/SKILL.md": [
        "---",
        "name: plugin-only",
        "---",
      ].join("\n"),
      "/.agents/skills/parent/SKILL.md": ["---", "name: parent", "---"].join(
        "\n",
      ),
      "/home/user/.codex/skills/home/SKILL.md": [
        "---",
        "name: home",
        "---",
      ].join("\n"),
      "/home/user/.agents/skills/weave/SKILL.md": [
        "---",
        "name: weave",
        "description: Dedupe loser",
        "---",
      ].join("\n"),
    });

    const result = await discoverCodexSkills({ fs, projectRoot: "/project" });

    expect(result.isOk()).toBe(true);
    const skills = result._unsafeUnwrap();
    expect(skills.map((skill) => skill.name)).toEqual([
      "weave",
      "debug",
      "plugin-only",
      "parent",
      "home",
    ]);
    expect(skills[0]?.metadata).toMatchObject({
      description: "Project wins",
    });
  });

  it("returns an empty list when no skill files exist", async () => {
    const fs = new MemoryCodexFileSystem();
    const result = await discoverCodexSkills({ fs, projectRoot: "/project" });

    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it("skips missing skill roots reported as ENOENT list failures", async () => {
    const fs = new MissingListFileSystem({
      "/project/.agents/skills/weave/SKILL.md": [
        "---",
        "name: weave",
        "---",
      ].join("\n"),
    });

    const result = await discoverCodexSkills({ fs, projectRoot: "/project" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map((skill) => skill.name)).toEqual([
      "weave",
    ]);
  });
});
