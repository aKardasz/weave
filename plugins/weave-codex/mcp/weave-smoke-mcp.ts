// weave-managed
const TOOL_NAME = "weave_smoke";

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function respond(id: JsonRpcRequest["id"], result: unknown): void {
  Bun.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id: JsonRpcRequest["id"], code: number, message: string): void {
  Bun.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

function toolResult(): unknown {
  const payload = {
    plugin: "weave-codex",
    tool: TOOL_NAME,
    pluginRoot: Bun.env.PLUGIN_ROOT ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? null,
    pluginData: Bun.env.PLUGIN_DATA ?? Bun.env.CLAUDE_PLUGIN_DATA ?? null,
    sessionId: Bun.env.CODEX_SESSION_ID ?? null,
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
    structuredContent: payload,
  };
}

function handle(request: JsonRpcRequest): void {
  if (request.method === "initialize") {
    respond(request.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "weave-codex-smoke", version: "0.0.1" },
    });
    return;
  }

  if (request.method === "tools/list") {
    respond(request.id, {
      tools: [
        {
          name: TOOL_NAME,
          description: "Report Weave Codex smoke plugin metadata.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    });
    return;
  }

  if (request.method === "tools/call") {
    const name = request.params?.name;
    if (name !== TOOL_NAME) {
      respondError(request.id, -32602, `Unknown tool: ${String(name)}`);
      return;
    }
    respond(request.id, toolResult());
    return;
  }

  if (request.method === "notifications/initialized") return;
  respondError(request.id, -32601, `Unsupported method: ${String(request.method)}`);
}

let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += new TextDecoder().decode(chunk);
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    handle(JSON.parse(line) as JsonRpcRequest);
  }
}
