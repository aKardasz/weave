import { describe, expect, it } from "bun:test";
import {
  renderAppManifest,
  renderHookManifest,
  renderMarketplace,
  renderMcpConfig,
  renderPluginManifest,
  renderSmokeApp,
  renderSmokeHookScript,
  renderSmokeMcpScript,
  renderWeaveSkill,
} from "../render-plugin.js";

describe("Codex plugin rendering", () => {
  it("renders a plugin manifest with skills path and ownership metadata", () => {
    const manifest = JSON.parse(renderPluginManifest());

    expect(manifest.name).toBe("weave-codex");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.apps).toBe("./.app.json");
    expect(manifest.hooks).toBe("./hooks/hooks.json");
    expect(manifest.metadata.ownership).toBe("weave-managed");
  });

  it("renders the weave skill", () => {
    const skill = renderWeaveSkill();

    expect(skill).toContain("name: weave");
    expect(skill).toContain(".codex/agents/");
  });

  it("renders hook smoke configuration", () => {
    const rendered = renderHookManifest();
    const parsed = JSON.parse(rendered);

    expect(parsed.hooks.SessionStart[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
      "weave-smoke-hook.ts",
    );
    expect(renderSmokeHookScript()).toContain("weave-smoke-hooks.jsonl");
  });

  it("renders MCP smoke configuration and server script", () => {
    const parsed = JSON.parse(renderMcpConfig());

    expect(parsed.mcp_servers["weave-smoke"].command).toBe("bun");
    const pluginRoot = "$" + "{PLUGIN_ROOT}";
    expect(parsed.mcp_servers["weave-smoke"].args).toContain(
      `${pluginRoot}/mcp/weave-smoke-mcp.ts`,
    );
    expect(renderSmokeMcpScript()).toContain("weave_smoke");
  });

  it("renders app smoke manifests", () => {
    const appManifest = JSON.parse(renderAppManifest());
    const app = JSON.parse(renderSmokeApp());

    expect(appManifest.apps["weave-smoke"]).toBe("./apps/weave-smoke-app.json");
    expect(app.metadata.ownership).toBe("weave-managed");
  });

  it("preserves unrelated marketplace entries", () => {
    const existing = JSON.stringify({
      name: "personal",
      interface: { displayName: "Personal" },
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
    });

    const rendered = renderMarketplace(existing);
    const parsed = JSON.parse(rendered);

    expect(parsed.name).toBe("personal");
    expect(parsed.plugins.map((entry: { name: string }) => entry.name)).toEqual(
      ["other", "weave-codex"],
    );
    expect(parsed.plugins[1].source.path).toBe("./plugins/weave-codex");
    expect(parsed.plugins[1].policy.installation).toBe("INSTALLED_BY_DEFAULT");
    expect(parsed.metadata.ownership).toBe("weave-managed");
  });
});
