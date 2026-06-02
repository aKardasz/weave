import { describe, expect, it } from "bun:test";
import { MemoryCodexFileSystem, packageCodexPluginArtifact } from "../index.js";

describe("packageCodexPluginArtifact", () => {
  it("writes a publishable plugin artifact", async () => {
    const fs = new MemoryCodexFileSystem();

    const result = await packageCodexPluginArtifact({
      fs,
      outputRoot: "/project/dist/codex-plugin",
    });

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.packageRoot).toBe("/project/dist/codex-plugin/weave-codex");
    const snapshot = fs.snapshot();
    expect(
      snapshot[
        "/project/dist/codex-plugin/weave-codex/.codex-plugin/plugin.json"
      ],
    ).toContain("weave-codex");
    expect(
      snapshot[
        "/project/dist/codex-plugin/weave-codex/.agents/plugins/marketplace.json"
      ],
    ).toContain("weave-codex");
    expect(
      snapshot["/project/dist/codex-plugin/weave-codex/README.md"],
    ).toContain("Publishable artifact");
  });
});
