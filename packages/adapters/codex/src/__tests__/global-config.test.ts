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
      "/home/user/.codex/hooks.json": JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: 'node "/existing/hook.js"',
                },
              ],
            },
          ],
        },
      }),
    });

    const result = await enableGlobalCodexPlugin({
      fs,
      force: false,
      agentArtifacts: [
        {
          name: "helper",
          content: '# weave-managed\nname = "helper"\n',
        },
      ],
      timestamp: "2026-05-29T00-00-00-000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().globalAgentCount).toBe(1);
    const snapshot = fs.snapshot();
    expect(
      snapshot["/home/user/plugins/weave-codex/.codex-plugin/plugin.json"],
    ).toContain("weave-codex");
    expect(
      snapshot["/home/user/plugins/weave-codex/mcp/weave-smoke-mcp.ts"],
    ).toContain("weave_smoke");
    expect(snapshot["/home/user/plugins/weave-codex/hooks.json"]).toContain(
      "SessionStart",
    );
    expect(
      snapshot[
        "/home/user/plugins/weave-codex/skills/weave/agents/openai.yaml"
      ],
    ).toContain('display_name: "Weave"');
    expect(snapshot["/home/user/.codex/agents/helper.toml"]).toContain(
      'name = "helper"',
    );
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
    expect(
      snapshot[
        "/home/user/.codex/hooks.json.weave-2026-05-29T00-00-00-000Z.bak"
      ],
    ).toContain("/existing/hook.js");

    const hooks = JSON.parse(snapshot["/home/user/.codex/hooks.json"] ?? "");
    expect(hooks.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
      "/existing/hook.js",
    );
    expect(hooks.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
      "weave-managed:codex-smoke-global-hook",
    );
    expect(hooks.hooks.SessionStart[0].hooks[0].command).toContain(
      "/home/user/plugins/weave-codex/hooks/weave-smoke-hook.ts",
    );
    expect(hooks.hooks.SubagentStart[0].hooks[0].command).toContain(
      "weave-managed:codex-smoke-global-hook",
    );
    expect(hooks.hooks.SubagentStop[0].hooks[0].command).toContain(
      "weave-managed:codex-smoke-global-hook",
    );

    const marketplace = JSON.parse(
      snapshot["/home/user/.agents/plugins/marketplace.json"] ?? "",
    );
    expect(
      marketplace.plugins.map((entry: { name: string }) => entry.name),
    ).toEqual(["other", "weave-codex"]);
    expect(marketplace.plugins[1].source.path).toBe("./plugins/weave-codex");
    expect(marketplace.plugins[1].policy.installation).toBe(
      "INSTALLED_BY_DEFAULT",
    );
  });

  it("fails closed on foreign global plugin files", async () => {
    const fs = new MemoryCodexFileSystem({
      "/home/user/plugins/weave-codex/.codex-plugin/plugin.json":
        '{"name":"foreign"}\n',
    });

    const result = await enableGlobalCodexPlugin({
      fs,
      timestamp: "2026-05-29T00-00-00-000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("ForeignFileCollision");
  });

  it("fails closed on foreign global agent files", async () => {
    const fs = new MemoryCodexFileSystem({
      "/home/user/.codex/agents/helper.toml": 'name = "foreign"\n',
    });

    const result = await enableGlobalCodexPlugin({
      fs,
      agentArtifacts: [
        {
          name: "helper",
          content: '# weave-managed\nname = "helper"\n',
        },
      ],
      timestamp: "2026-05-29T00-00-00-000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("ForeignFileCollision");
  });
});
