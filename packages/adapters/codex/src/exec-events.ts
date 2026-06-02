import { err, ok, Result } from "neverthrow";

export type CodexJsonEventParseError = {
  readonly type: "CodexJsonEventParseError";
  readonly line: number;
  readonly message: string;
};

export type CodexUsageUnavailable = {
  readonly type: "CodexUsageUnavailable";
  readonly message: string;
};

export type CodexTokenUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
};

export type CodexParsedExecEvents = {
  readonly eventCount: number;
  readonly finalMessage: string | undefined;
  readonly reviewApproved: boolean | undefined;
  readonly usage: CodexTokenUsage | undefined;
  readonly usageUnavailable: CodexUsageUnavailable | undefined;
};

type JsonRecord = Record<string, unknown>;

export function parseCodexExecJsonEvents(
  stdout: string,
): Result<CodexParsedExecEvents, CodexJsonEventParseError> {
  const events: JsonRecord[] = [];
  const lines = stdout.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.length === 0) continue;

    const parsed = Result.fromThrowable(
      JSON.parse,
      (cause): CodexJsonEventParseError => ({
        type: "CodexJsonEventParseError",
        line: index + 1,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    )(line);
    if (parsed.isErr()) return err(parsed.error);
    if (isRecord(parsed.value)) events.push(parsed.value);
  }

  const usage = extractUsage(events);
  return ok({
    eventCount: events.length,
    finalMessage: extractFinalMessage(events),
    reviewApproved: extractReviewApproved(events),
    usage,
    usageUnavailable:
      usage === undefined
        ? {
            type: "CodexUsageUnavailable",
            message: "Codex JSON events did not include token usage.",
          }
        : undefined,
  });
}

function extractFinalMessage(events: JsonRecord[]): string | undefined {
  for (const event of [...events].reverse()) {
    const candidate =
      stringAt(event, ["message"]) ??
      stringAt(event, ["text"]) ??
      stringAt(event, ["content"]) ??
      stringAt(event, ["payload", "message"]) ??
      stringAt(event, ["payload", "text"]) ??
      stringAt(event, ["payload", "content"]);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function extractReviewApproved(events: JsonRecord[]): boolean | undefined {
  for (const event of [...events].reverse()) {
    const approved =
      booleanAt(event, ["approved"]) ??
      booleanAt(event, ["payload", "approved"]) ??
      booleanAt(event, ["result", "approved"]);
    if (approved !== undefined) return approved;
  }

  const finalMessage = extractFinalMessage(events)?.trim().toLowerCase();
  if (finalMessage === undefined) return undefined;
  if (finalMessage.includes('"approved": true')) return true;
  if (finalMessage.includes('"approved":true')) return true;
  if (finalMessage.includes('"approved": false')) return false;
  if (finalMessage.includes('"approved":false')) return false;
  if (finalMessage.includes("approved: true")) return true;
  if (finalMessage.includes("approved: false")) return false;
  return undefined;
}

function extractUsage(events: JsonRecord[]): CodexTokenUsage | undefined {
  for (const event of [...events].reverse()) {
    const usage =
      recordAt(event, ["usage"]) ?? recordAt(event, ["payload", "usage"]);
    if (usage === undefined) continue;

    const inputTokens =
      numberAt(usage, ["input_tokens"]) ?? numberAt(usage, ["inputTokens"]);
    const outputTokens =
      numberAt(usage, ["output_tokens"]) ?? numberAt(usage, ["outputTokens"]);
    const totalTokens =
      numberAt(usage, ["total_tokens"]) ??
      numberAt(usage, ["totalTokens"]) ??
      (inputTokens !== undefined && outputTokens !== undefined
        ? inputTokens + outputTokens
        : undefined);

    if (
      inputTokens !== undefined ||
      outputTokens !== undefined ||
      totalTokens !== undefined
    ) {
      return { inputTokens, outputTokens, totalTokens };
    }
  }

  return undefined;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  const found = valueAt(value, path);
  return typeof found === "string" ? found : undefined;
}

function booleanAt(
  value: unknown,
  path: readonly string[],
): boolean | undefined {
  const found = valueAt(value, path);
  return typeof found === "boolean" ? found : undefined;
}

function numberAt(value: unknown, path: readonly string[]): number | undefined {
  const found = valueAt(value, path);
  return typeof found === "number" && Number.isFinite(found)
    ? found
    : undefined;
}

function recordAt(
  value: unknown,
  path: readonly string[],
): JsonRecord | undefined {
  const found = valueAt(value, path);
  return isRecord(found) ? found : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
