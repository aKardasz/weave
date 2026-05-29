import { describe, expect, it } from "bun:test";
import { MemoryFileSystem } from "../../fs/file-system.js";
import { installAllSupported, installerRegistry } from "../index.js";

function opencodeConfig() {
  return "/home/user/.config/opencode/config.json";
}

function codexConfig() {
  return "/project/.codex/config.toml";
}

describe("harness installers", () => {
  it("installs supported OpenCode integration", async () => {
    const fs = new MemoryFileSystem({ [opencodeConfig()]: "{}" });
    const installer = installerRegistry(fs).opencode;
    const result = await installer.install({
      harness: "opencode",
      configPath: opencodeConfig(),
      selectedModules: [],
      force: false,
    });
    expect(result._unsafeUnwrap().changed).toBe(true);
    expect(fs.snapshot()[opencodeConfig()]).toContain("weave:init");
  });

  it("installs optional adapter modules", async () => {
    const fs = new MemoryFileSystem({ [opencodeConfig()]: "{}" });
    const installer = installerRegistry(fs).opencode;
    const result = await installer.install({
      harness: "opencode",
      configPath: opencodeConfig(),
      selectedModules: ["agents"],
      force: false,
    });
    expect(result._unsafeUnwrap().messages.join("\n")).toContain(
      "agent module",
    );
    expect(
      fs.snapshot()["/home/user/.config/opencode/weave-agents.json"],
    ).toContain("@weave/cli");
  });

  it("is idempotent without force", async () => {
    const fs = new MemoryFileSystem({ [opencodeConfig()]: "{}" });
    const installer = installerRegistry(fs).opencode;
    await installer.install({
      harness: "opencode",
      configPath: opencodeConfig(),
      selectedModules: [],
      force: false,
    });
    const second = await installer.install({
      harness: "opencode",
      configPath: opencodeConfig(),
      selectedModules: [],
      force: false,
    });
    expect(second._unsafeUnwrap().changed).toBe(false);
    const matches = fs.snapshot()[opencodeConfig()].match(/weave:init/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("allows forced reinstall marker", async () => {
    const fs = new MemoryFileSystem({
      [opencodeConfig()]: "{}\n// weave:init:install\n",
    });
    const installer = installerRegistry(fs).opencode;
    const result = await installer.install({
      harness: "opencode",
      configPath: opencodeConfig(),
      selectedModules: [],
      force: true,
    });
    expect(result._unsafeUnwrap().changed).toBe(true);
    expect(fs.snapshot()[opencodeConfig()]).toContain("weave:init:force");
  });

  it("returns unsupported explicit harness errors", async () => {
    const fs = new MemoryFileSystem();
    const installer = installerRegistry(fs).pi;
    const result = await installer.install({
      harness: "pi",
      configPath: "/home/user/.pi/config.json",
      selectedModules: [],
      force: false,
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("UnsupportedHarness");
  });

  it("installs supported Codex integration", async () => {
    const fs = new MemoryFileSystem({ [codexConfig()]: "" });
    const installer = installerRegistry(fs).codex;
    const result = await installer.install({
      harness: "codex",
      configPath: codexConfig(),
      selectedModules: [],
      force: false,
    });

    expect(result._unsafeUnwrap().changed).toBe(true);
    const snapshot = fs.snapshot();
    expect(
      snapshot["/project/plugins/weave-codex/.codex-plugin/plugin.json"],
    ).toContain("weave-codex");
    expect(
      snapshot["/project/plugins/weave-codex/skills/weave/SKILL.md"],
    ).toContain("name: weave");
    expect(snapshot["/project/.agents/plugins/marketplace.json"]).toContain(
      "weave-codex",
    );
    expect(snapshot["/home/user/.codex/config.toml"]).toBeUndefined();
  });

  it("installs Codex global files only with codexGlobal", async () => {
    const fs = new MemoryFileSystem({
      [codexConfig()]: "",
      "/home/user/.codex/config.toml": "[features]\napps = false\n",
    });
    const installer = installerRegistry(fs).codex;
    const result = await installer.install({
      harness: "codex",
      configPath: codexConfig(),
      selectedModules: [],
      force: false,
      codexGlobal: true,
    });

    expect(result._unsafeUnwrap().changed).toBe(true);
    const snapshot = fs.snapshot();
    expect(
      snapshot[
        "/home/user/.codex/plugins/weave-codex/.codex-plugin/plugin.json"
      ],
    ).toContain("weave-codex");
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      '[plugins."weave-codex".mcp_servers.weave-smoke]',
    );
  });

  it("does not overwrite foreign Codex marketplace files", async () => {
    const fs = new MemoryFileSystem({
      [codexConfig()]: "",
      "/project/.agents/plugins/marketplace.json": '{"plugins":[]}\n',
    });
    const installer = installerRegistry(fs).codex;
    const result = await installer.install({
      harness: "codex",
      configPath: codexConfig(),
      selectedModules: [],
      force: false,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("InstallFailed");
  });

  it("bulk install skips unsupported harnesses", async () => {
    const fs = new MemoryFileSystem({ [opencodeConfig()]: "{}" });
    const result = await installAllSupported({
      fs,
      harnesses: [
        { id: "opencode", configPath: opencodeConfig() },
        { id: "codex", configPath: codexConfig() },
        { id: "pi", configPath: "/home/user/.pi/config.json" },
      ],
      force: false,
    });
    const messages = result
      ._unsafeUnwrap()
      .flatMap((entry) => entry.messages)
      .join("\n");
    expect(messages).toContain("Skipped pi");
  });
});
