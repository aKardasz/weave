export function safeCodexFileStem(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_-]+/g, "-");
  const collapsed = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (collapsed.length === 0) return "agent";
  return collapsed;
}
