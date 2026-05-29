import { describe, expect, it } from "bun:test";
import { enableGlobalCodexPlugin, MemoryCodexFileSystem } from "../index.js";

describe("Codex global enablement", () => {
  it("writes global plugin files, marketplace, config block, and backup", async () => {
    const fs = new MemoryCodexFileSystem({
      "/home/user/.codex/config.toml": [
        "[features]",
        "apps = false",
        "hooks = false",
        "",
        "[mcp_servers.keep]",
        'command = "keep"',
      ].join("\n"),
      "/home/user/.agents/plugins/marketplace.json": JSON.stringify({
        metadata: { ownership: "weave-managed" },
        plugins: [
          {
            name: "other",
            source: {
              source: "local",
              path: "./plugins/other",
            },
            policy: {
              installation: "AVAILABLE",
              authentication: "ON_INSTALL",
            },
            category: "Productivity",
          },
        ],
      }),
    });

    const result = await enableGlobalCodexPlugin({
      fs,
      force: false,
      timestamp: "2026-05-29T00-00-00-000Z",
    });

    expect(result.isOk()).toBe(true);
    const snapshot = fs.snapshot();
    expect(
      snapshot[
        "/home/user/.codex/plugins/weave-codex/.codex-plugin/plugin.json"
      ],
    ).toContain("weave-codex");
    expect(
      snapshot["/home/user/.codex/plugins/weave-codex/mcp/weave-smoke-mcp.ts"],
    ).toContain("weave_smoke");
    expect(snapshot["/home/user/.codex/config.toml"]).toContain("apps = true");
    expect(snapshot["/home/user/.codex/config.toml"]).toContain("hooks = true");
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      "plugin_hooks = true",
    );
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      "plugins = true",
    );
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      '[plugins."weave-codex"]',
    );
    expect(snapshot["/home/user/.codex/config.toml"]).toContain(
      '[plugins."weave-codex".mcp_servers.weave-smoke]',
    );
    expect(
      snapshot[
        "/home/user/.codex/config.toml.weave-2026-05-29T00-00-00-000Z.bak"
      ],
    ).toContain("apps = false");

    const marketplace = JSON.parse(
      snapshot["/home/user/.agents/plugins/marketplace.json"] ?? "",
    );
    expect(
      marketplace.plugins.map((entry: { name: string }) => entry.name),
    ).toEqual(["other", "weave-codex"]);
    expect(marketplace.plugins[1].source.path).toBe(
      "./.codex/plugins/weave-codex",
    );
    expect(marketplace.plugins[1].policy.installation).toBe(
      "INSTALLED_BY_DEFAULT",
    );
  });

  it("fails closed on foreign global plugin files", async () => {
    const fs = new MemoryCodexFileSystem({
      "/home/user/.codex/plugins/weave-codex/.codex-plugin/plugin.json":
        '{"name":"foreign"}\n',
    });

    const result = await enableGlobalCodexPlugin({
      fs,
      timestamp: "2026-05-29T00-00-00-000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("ForeignFileCollision");
  });
});
