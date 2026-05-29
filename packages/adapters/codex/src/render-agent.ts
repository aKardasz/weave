import type { AgentDescriptor } from "@weave/engine";
import { err, ok, type Result } from "neverthrow";
import { WEAVE_GENERATED_BY, WEAVE_MANAGED_MARKER } from "./constants.js";

export type CodexAgentConfig = {
  name: string;
  description: string;
  developer_instructions: string;
  model?: string;
  model_reasoning_effort?: string;
  nickname_candidates?: string[];
  sandbox_mode?: "read-only";
};

export type TranslateAgentError = {
  type: "TranslateAgentError";
  agentName: string;
  message: string;
};

export function translateAgent(
  descriptor: AgentDescriptor,
  resolvedModel?: string,
): Result<CodexAgentConfig, TranslateAgentError> {
  if (descriptor.name.trim().length === 0) {
    return err({
      type: "TranslateAgentError",
      agentName: descriptor.name,
      message: "Codex custom agent name cannot be empty.",
    });
  }

  const config: CodexAgentConfig = {
    name: descriptor.name,
    description: descriptor.description ?? descriptor.name,
    developer_instructions: renderDeveloperInstructions(descriptor),
  };

  if (resolvedModel !== undefined) {
    config.model = resolvedModel;
  }

  if (descriptor.displayName !== undefined) {
    config.nickname_candidates = [descriptor.displayName];
  }

  if (
    descriptor.effectiveToolPolicy.write === "deny" ||
    descriptor.effectiveToolPolicy.execute === "deny"
  ) {
    config.sandbox_mode = "read-only";
  }

  return ok(config);
}

export function renderAgentToml(config: CodexAgentConfig): string {
  const lines = [
    `# ${WEAVE_MANAGED_MARKER}`,
    `# generated-by = "${WEAVE_GENERATED_BY}"`,
    `name = ${tomlString(config.name)}`,
    `description = ${tomlString(config.description)}`,
    `developer_instructions = ${tomlMultilineString(config.developer_instructions)}`,
  ];

  if (config.model !== undefined) {
    lines.push(`model = ${tomlString(config.model)}`);
  }

  if (config.model_reasoning_effort !== undefined) {
    lines.push(
      `model_reasoning_effort = ${tomlString(config.model_reasoning_effort)}`,
    );
  }

  if (config.sandbox_mode !== undefined) {
    lines.push(`sandbox_mode = ${tomlString(config.sandbox_mode)}`);
  }

  if (
    config.nickname_candidates !== undefined &&
    config.nickname_candidates.length > 0
  ) {
    lines.push(
      `nickname_candidates = [${config.nickname_candidates.map(tomlString).join(", ")}]`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderDeveloperInstructions(descriptor: AgentDescriptor): string {
  return [
    descriptor.composedPrompt,
    "",
    "## Weave Tool Policy",
    `- read: ${descriptor.effectiveToolPolicy.read}`,
    `- write: ${descriptor.effectiveToolPolicy.write}`,
    `- execute: ${descriptor.effectiveToolPolicy.execute}`,
    `- delegate: ${descriptor.effectiveToolPolicy.delegate}`,
    `- network: ${descriptor.effectiveToolPolicy.network}`,
    "",
    "Follow these policy values as behavioral constraints. Codex runtime permissions still come from the active session and any agent-specific sandbox override.",
  ].join("\n");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlMultilineString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
  return `"""${escaped}"""`;
}
