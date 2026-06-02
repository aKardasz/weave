import { describe, expect, it } from "bun:test";
import { parseCodexExecJsonEvents } from "../index.js";

describe("parseCodexExecJsonEvents", () => {
  it("parses usage and final text from JSONL events", () => {
    const result = parseCodexExecJsonEvents(
      [
        JSON.stringify({ type: "message", payload: { text: "working" } }),
        JSON.stringify({
          type: "usage",
          usage: { input_tokens: 3, output_tokens: 5 },
        }),
        JSON.stringify({ type: "final", message: "done" }),
      ].join("\n"),
    );

    expect(result.isOk()).toBe(true);
    const parsed = result._unsafeUnwrap();
    expect(parsed.eventCount).toBe(3);
    expect(parsed.finalMessage).toBe("done");
    expect(parsed.usage?.totalTokens).toBe(8);
    expect(parsed.usageUnavailable).toBeUndefined();
  });

  it("returns usage unavailable when no usage event exists", () => {
    const result = parseCodexExecJsonEvents(
      JSON.stringify({ message: "done" }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().usage).toBeUndefined();
    expect(result._unsafeUnwrap().usageUnavailable?.type).toBe(
      "CodexUsageUnavailable",
    );
  });

  it("extracts review approval from structured events", () => {
    const result = parseCodexExecJsonEvents(
      JSON.stringify({ payload: { approved: false, message: "reject" } }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().reviewApproved).toBe(false);
  });

  it("returns a typed parse error for malformed JSONL", () => {
    const result = parseCodexExecJsonEvents("{bad json");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("CodexJsonEventParseError");
  });
});
