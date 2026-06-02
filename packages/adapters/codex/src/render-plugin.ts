import {
  CODEX_PLUGIN_RELATIVE_PATH,
  CODEX_SMOKE_MCP_SERVER_NAME,
  CODEX_SMOKE_MCP_TOOL_NAME,
  WEAVE_CODEX_PLUGIN_NAME,
  WEAVE_GENERATED_BY,
  WEAVE_MANAGED_MARKER,
} from "./constants.js";

export type CodexPluginManifest = {
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    url: string;
  };
  keywords: string[];
  skills: string;
  mcpServers: string;
  apps: string;
  interface: {
    displayName: string;
    shortDescription: string;
    longDescription: string;
    developerName: string;
    category: string;
    capabilities: string[];
    defaultPrompt: string[];
  };
};

export type MarketplaceEntry = {
  name: string;
  source: {
    source: "local";
    path: string;
  };
  policy: {
    installation: "INSTALLED_BY_DEFAULT";
    authentication: "ON_INSTALL";
  };
  category: string;
};

export type Marketplace = {
  name: string;
  interface: {
    displayName: string;
  };
  plugins: unknown[];
  metadata: {
    generatedBy: string;
    ownership: string;
  };
};

export type RenderMarketplaceOptions = {
  marketplaceName?: string;
  marketplaceDisplayName?: string;
  pluginSourcePath?: string;
};

export function renderPluginManifest(): string {
  const manifest: CodexPluginManifest = {
    name: WEAVE_CODEX_PLUGIN_NAME,
    version: "0.0.1",
    description:
      "Repo-local Weave workflows and adapter affordances for Codex.",
    author: {
      name: "Weave",
      url: "https://github.com/adrianwedd/weave",
    },
    keywords: ["weave", "codex", WEAVE_MANAGED_MARKER],
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    apps: "./.app.json",
    interface: {
      displayName: "Weave Codex",
      shortDescription: "Weave-generated agents and runtime smoke surfaces.",
      longDescription:
        "Repo-local Weave affordances for Codex custom agents, skills, MCP smoke tooling, and app metadata.",
      developerName: "Weave",
      category: "Productivity",
      capabilities: ["Interactive", "Read"],
      defaultPrompt: ["Use Weave-generated Codex agents"],
    },
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function renderWeaveSkill(): string {
  return [
    "---",
    "name: weave",
    'description: "Use when the user wants Codex to operate through Weave-generated agents, workflows, or adapter materialization conventions."',
    "---",
    "",
    "<!-- weave-managed -->",
    "",
    "# Weave",
    "",
    "Use the generated Codex custom agents under `.codex/agents/` for specialized Weave roles.",
    "Treat this skill as the repo-local entrypoint for Weave-aware coordination in Codex.",
    "",
    "When delegating, prefer the generated agent whose description best matches the task.",
    "The smoke runtime surfaces prove Codex can load Weave plugin hooks, MCP, and app metadata.",
    "When the user asks to run a Weave workflow from the shell, use `weave codex run-workflow <workflow> --goal <text>` from the repository root.",
    "Use `--codex-global` only when the user explicitly asks to enable global Codex plugin configuration.",
    "",
  ].join("\n");
}

export function renderWeaveSkillOpenAiMetadata(): string {
  return [
    "# weave-managed",
    "interface:",
    '  display_name: "Weave"',
    '  short_description: "Use Weave-generated Codex agents and workflows"',
    '  default_prompt: "Use Weave-generated Codex agents for this repository."',
    "",
  ].join("\n");
}

export function renderHookManifest(): string {
  const pluginRoot = "$" + "{PLUGIN_ROOT}";
  const command = `bun run ${pluginRoot}/hooks/weave-smoke-hook.ts`;
  const hooks = {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: "command",
              command,
              statusMessage: "Recording Weave smoke hook",
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command,
              statusMessage: "Recording Weave prompt smoke hook",
            },
          ],
        },
      ],
      SubagentStart: [
        {
          hooks: [
            {
              type: "command",
              command,
              statusMessage: "Recording Weave subagent start smoke hook",
            },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            {
              type: "command",
              command,
              statusMessage: "Recording Weave subagent stop smoke hook",
            },
          ],
        },
      ],
    },
    metadata: {
      generatedBy: WEAVE_GENERATED_BY,
      ownership: WEAVE_MANAGED_MARKER,
    },
  };

  return `${JSON.stringify(hooks, null, 2)}\n`;
}

export function renderSmokeHookScript(): string {
  const pluginDataExpr = jsTemplateExpression("pluginData");
  const existingExpr = jsTemplateExpression("existing");
  const proofExpr = jsTemplateExpression("JSON.stringify(proof)");
  const mirrorDirExpr = jsTemplateExpression("mirrorDir");
  const mirrorExistingExpr = jsTemplateExpression("mirrorExisting");

  return [
    "// weave-managed",
    "const chunks: Uint8Array[] = [];",
    "",
    "for await (const chunk of Bun.stdin.stream()) {",
    "  chunks.push(chunk);",
    "}",
    "",
    "const decoder = new TextDecoder();",
    'const input = chunks.map((chunk) => decoder.decode(chunk)).join("");',
    "let payload: unknown = null;",
    "",
    "try {",
    "  payload = input.trim().length > 0 ? JSON.parse(input) : null;",
    "} catch (error) {",
    "  payload = { parseError: error instanceof Error ? error.message : String(error), raw: input };",
    "}",
    "",
    "const mirrorProofPath = Bun.env.WEAVE_CODEX_SMOKE_PROOF;",
    'if (Bun.env.WEAVE_CODEX_SMOKE_GLOBAL_FALLBACK === "weave-managed" && (mirrorProofPath === undefined || mirrorProofPath.length === 0)) {',
    "  process.exit(0);",
    "}",
    'const fallbackPluginData = mirrorProofPath?.split("/").slice(0, -1).join("/");',
    'const pluginData = Bun.env.PLUGIN_DATA ?? Bun.env.CLAUDE_PLUGIN_DATA ?? fallbackPluginData ?? ".";',
    `const proofPath = \`${pluginDataExpr}/weave-smoke-hooks.jsonl\`;`,
    "const proof = {",
    '  generatedBy: "@weave/adapter-codex",',
    '  marker: "weave-managed",',
    "  observedAt: new Date().toISOString(),",
    "  pluginRoot: Bun.env.PLUGIN_ROOT ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? null,",
    "  payload,",
    "};",
    "",
    `await Bun.$\`mkdir -p ${pluginDataExpr}\`.quiet();`,
    'const existing = await Bun.file(proofPath).exists() ? await Bun.file(proofPath).text() : "";',
    `await Bun.write(proofPath, \`${existingExpr}${proofExpr}\\n\`);`,
    "",
    "if (mirrorProofPath !== undefined && mirrorProofPath.length > 0 && mirrorProofPath !== proofPath) {",
    '  const mirrorDir = mirrorProofPath.split("/").slice(0, -1).join("/") || ".";',
    `  await Bun.$\`mkdir -p ${mirrorDirExpr}\`.quiet();`,
    '  const mirrorExisting = await Bun.file(mirrorProofPath).exists() ? await Bun.file(mirrorProofPath).text() : "";',
    `  await Bun.write(mirrorProofPath, \`${mirrorExistingExpr}${proofExpr}\\n\`);`,
    "}",
    "",
  ].join("\n");
}

export function renderMcpConfig(): string {
  const pluginRoot = "$" + "{PLUGIN_ROOT}";
  const config = {
    mcpServers: {
      [CODEX_SMOKE_MCP_SERVER_NAME]: {
        command: "bun",
        args: ["run", `${pluginRoot}/mcp/weave-smoke-mcp.ts`],
        env: {
          WEAVE_CODEX_SMOKE_PLUGIN: WEAVE_CODEX_PLUGIN_NAME,
        },
        note: `${WEAVE_GENERATED_BY} ${WEAVE_MANAGED_MARKER}`,
      },
    },
  };

  return `${JSON.stringify(config, null, 2)}\n`;
}

export function renderSmokeMcpScript(): string {
  const jsonResponseExpr = jsTemplateExpression(
    'JSON.stringify({ jsonrpc: "2.0", id, result })',
  );
  const jsonErrorExpr = jsTemplateExpression(
    'JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })',
  );
  const nameExpr = jsTemplateExpression("String(name)");
  const methodExpr = jsTemplateExpression("String(request.method)");

  return [
    "// weave-managed",
    `const TOOL_NAME = "${CODEX_SMOKE_MCP_TOOL_NAME}";`,
    "",
    "type JsonRpcRequest = {",
    "  id?: string | number | null;",
    "  method?: string;",
    "  params?: Record<string, unknown>;",
    "};",
    "",
    'function respond(id: JsonRpcRequest["id"], result: unknown): void {',
    `  Bun.stdout.write(\`${jsonResponseExpr}\\n\`);`,
    "}",
    "",
    'function respondError(id: JsonRpcRequest["id"], code: number, message: string): void {',
    `  Bun.stdout.write(\`${jsonErrorExpr}\\n\`);`,
    "}",
    "",
    "function toolResult(): unknown {",
    "  const payload = {",
    '    plugin: "weave-codex",',
    "    tool: TOOL_NAME,",
    "    pluginRoot: Bun.env.PLUGIN_ROOT ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? null,",
    "    pluginData: Bun.env.PLUGIN_DATA ?? Bun.env.CLAUDE_PLUGIN_DATA ?? null,",
    "    sessionId: Bun.env.CODEX_SESSION_ID ?? null,",
    "  };",
    "",
    "  return {",
    "    content: [",
    "      {",
    '        type: "text",',
    "        text: JSON.stringify(payload),",
    "      },",
    "    ],",
    "    structuredContent: payload,",
    "  };",
    "}",
    "",
    "function handle(request: JsonRpcRequest): void {",
    '  if (request.method === "initialize") {',
    "    respond(request.id, {",
    '      protocolVersion: "2024-11-05",',
    "      capabilities: { tools: {} },",
    '      serverInfo: { name: "weave-codex-smoke", version: "0.0.1" },',
    "    });",
    "    return;",
    "  }",
    "",
    '  if (request.method === "tools/list") {',
    "    respond(request.id, {",
    "      tools: [",
    "        {",
    "          name: TOOL_NAME,",
    '          description: "Report Weave Codex smoke plugin metadata.",',
    '          inputSchema: { type: "object", properties: {}, additionalProperties: false },',
    "        },",
    "      ],",
    "    });",
    "    return;",
    "  }",
    "",
    '  if (request.method === "tools/call") {',
    "    const name = request.params?.name;",
    "    if (name !== TOOL_NAME) {",
    `      respondError(request.id, -32602, \`Unknown tool: ${nameExpr}\`);`,
    "      return;",
    "    }",
    "    respond(request.id, toolResult());",
    "    return;",
    "  }",
    "",
    '  if (request.method === "notifications/initialized") return;',
    `  respondError(request.id, -32601, \`Unsupported method: ${methodExpr}\`);`,
    "}",
    "",
    'let buffer = "";',
    "for await (const chunk of Bun.stdin.stream()) {",
    "  buffer += new TextDecoder().decode(chunk);",
    '  const lines = buffer.split("\\n");',
    '  buffer = lines.pop() ?? "";',
    "  for (const line of lines) {",
    "    if (line.trim().length === 0) continue;",
    "    handle(JSON.parse(line) as JsonRpcRequest);",
    "  }",
    "}",
    "",
  ].join("\n");
}

function jsTemplateExpression(expression: string): string {
  return `$${"{"}${expression}${"}"}`;
}

export function renderAppManifest(): string {
  const manifest = {
    apps: {
      "weave-smoke": {
        id: WEAVE_MANAGED_MARKER,
      },
    },
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function renderSmokeApp(): string {
  const app = {
    name: "weave-smoke",
    displayName: "Weave Smoke",
    description:
      "Static app metadata proving the Weave Codex plugin app surface is packaged.",
    metadata: {
      generatedBy: WEAVE_GENERATED_BY,
      ownership: WEAVE_MANAGED_MARKER,
      plugin: WEAVE_CODEX_PLUGIN_NAME,
    },
  };

  return `${JSON.stringify(app, null, 2)}\n`;
}

export function renderMarketplace(
  existingContent?: string,
  options: RenderMarketplaceOptions = {},
): string {
  const marketplace = parseMarketplace(existingContent, options);
  const nextEntry = defaultMarketplaceEntry(options);
  const withoutWeave = marketplace.plugins.filter(
    (entry) => !isWeaveEntry(entry),
  );

  return `${JSON.stringify(
    {
      ...marketplace,
      metadata: {
        generatedBy: WEAVE_GENERATED_BY,
        ownership: WEAVE_MANAGED_MARKER,
      },
      plugins: [...withoutWeave, nextEntry],
    },
    null,
    2,
  )}\n`;
}

function parseMarketplace(
  existingContent: string | undefined,
  options: RenderMarketplaceOptions,
): Marketplace {
  const fallback = defaultMarketplace(options);
  if (existingContent === undefined || existingContent.trim().length === 0) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(
      stripJsonComments(existingContent),
    ) as Partial<Marketplace>;
    if (!Array.isArray(parsed.plugins)) return fallback;
    return {
      name: typeof parsed.name === "string" ? parsed.name : fallback.name,
      interface: isMarketplaceInterface(parsed.interface)
        ? parsed.interface
        : fallback.interface,
      metadata: isMarketplaceMetadata(parsed.metadata)
        ? parsed.metadata
        : fallback.metadata,
      plugins: parsed.plugins.filter(isObject),
    };
  } catch {
    return fallback;
  }
}

function stripJsonComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarketplaceInterface(
  value: unknown,
): value is Marketplace["interface"] {
  if (!isObject(value)) return false;
  return typeof value.displayName === "string";
}

function isMarketplaceMetadata(
  value: unknown,
): value is Marketplace["metadata"] {
  if (!isObject(value)) return false;
  return (
    typeof value.generatedBy === "string" && typeof value.ownership === "string"
  );
}

function isWeaveEntry(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    value.name === WEAVE_CODEX_PLUGIN_NAME ||
    value.id === WEAVE_CODEX_PLUGIN_NAME
  );
}

function defaultMarketplace(options: RenderMarketplaceOptions): Marketplace {
  return {
    name: options.marketplaceName ?? "weave-local",
    interface: {
      displayName: options.marketplaceDisplayName ?? "Weave Local Plugins",
    },
    plugins: [],
    metadata: {
      generatedBy: WEAVE_GENERATED_BY,
      ownership: WEAVE_MANAGED_MARKER,
    },
  };
}

function defaultMarketplaceEntry(
  options: RenderMarketplaceOptions,
): MarketplaceEntry {
  return {
    name: WEAVE_CODEX_PLUGIN_NAME,
    source: {
      source: "local",
      path: options.pluginSourcePath ?? `./${CODEX_PLUGIN_RELATIVE_PATH}`,
    },
    policy: {
      installation: "INSTALLED_BY_DEFAULT",
      authentication: "ON_INSTALL",
    },
    category: "Productivity",
  };
}
