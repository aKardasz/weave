// weave-managed
const chunks: Uint8Array[] = [];

for await (const chunk of Bun.stdin.stream()) {
  chunks.push(chunk);
}

const decoder = new TextDecoder();
const input = chunks.map((chunk) => decoder.decode(chunk)).join("");
let payload: unknown = null;

try {
  payload = input.trim().length > 0 ? JSON.parse(input) : null;
} catch (error) {
  payload = { parseError: error instanceof Error ? error.message : String(error), raw: input };
}

const mirrorProofPath = Bun.env.WEAVE_CODEX_SMOKE_PROOF;
if (Bun.env.WEAVE_CODEX_SMOKE_GLOBAL_FALLBACK === "weave-managed" && (mirrorProofPath === undefined || mirrorProofPath.length === 0)) {
  process.exit(0);
}
const fallbackPluginData = mirrorProofPath?.split("/").slice(0, -1).join("/");
const pluginData = Bun.env.PLUGIN_DATA ?? Bun.env.CLAUDE_PLUGIN_DATA ?? fallbackPluginData ?? ".";
const proofPath = `${pluginData}/weave-smoke-hooks.jsonl`;
const proof = {
  generatedBy: "@weave/adapter-codex",
  marker: "weave-managed",
  observedAt: new Date().toISOString(),
  pluginRoot: Bun.env.PLUGIN_ROOT ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? null,
  payload,
};

await Bun.$`mkdir -p ${pluginData}`.quiet();
const existing = await Bun.file(proofPath).exists() ? await Bun.file(proofPath).text() : "";
await Bun.write(proofPath, `${existing}${JSON.stringify(proof)}\n`);

if (mirrorProofPath !== undefined && mirrorProofPath.length > 0 && mirrorProofPath !== proofPath) {
  const mirrorDir = mirrorProofPath.split("/").slice(0, -1).join("/") || ".";
  await Bun.$`mkdir -p ${mirrorDir}`.quiet();
  const mirrorExisting = await Bun.file(mirrorProofPath).exists() ? await Bun.file(mirrorProofPath).text() : "";
  await Bun.write(mirrorProofPath, `${mirrorExisting}${JSON.stringify(proof)}\n`);
}
