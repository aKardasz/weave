import { ok, okAsync, type Result, type ResultAsync } from "neverthrow";
import {
  BunCodexProcessRunner,
  type CodexProcessRunError,
  type CodexProcessRunner,
} from "./process-runner.js";

export type CodexNativeAgentCapability = {
  readonly canExecuteCustomAgent: boolean;
  readonly selectorFlag: "--agent" | "--custom-agent" | undefined;
  readonly source: "help" | "injected";
  readonly detail: string;
};

export type CodexNativeCapabilityError = CodexProcessRunError;

export interface CodexNativeCapabilityProvider {
  probe(): ResultAsync<CodexNativeAgentCapability, CodexNativeCapabilityError>;
}

export class StaticCodexNativeCapabilityProvider
  implements CodexNativeCapabilityProvider
{
  constructor(private readonly capability: CodexNativeAgentCapability) {}

  probe(): ResultAsync<CodexNativeAgentCapability, CodexNativeCapabilityError> {
    return okAsync(this.capability);
  }
}

export class CodexExecHelpCapabilityProvider
  implements CodexNativeCapabilityProvider
{
  private readonly processRunner: CodexProcessRunner;

  constructor(processRunner: CodexProcessRunner = new BunCodexProcessRunner()) {
    this.processRunner = processRunner;
  }

  probe(): ResultAsync<CodexNativeAgentCapability, CodexNativeCapabilityError> {
    return this.processRunner
      .run("codex", ["exec", "--help"])
      .map((result) =>
        parseCodexExecHelpForNativeAgentCapability(
          `${result.stdout}\n${result.stderr}`,
        ),
      );
  }
}

export function parseCodexExecHelpForNativeAgentCapability(
  helpText: string,
): CodexNativeAgentCapability {
  if (helpText.includes("--agent ")) {
    return {
      canExecuteCustomAgent: true,
      selectorFlag: "--agent",
      source: "help",
      detail: "codex exec exposes --agent.",
    };
  }

  if (helpText.includes("--custom-agent ")) {
    return {
      canExecuteCustomAgent: true,
      selectorFlag: "--custom-agent",
      source: "help",
      detail: "codex exec exposes --custom-agent.",
    };
  }

  return {
    canExecuteCustomAgent: false,
    selectorFlag: undefined,
    source: "help",
    detail: "codex exec help does not expose a custom-agent selector.",
  };
}

export function injectedNativeCapability(
  selectorFlag: "--agent" | "--custom-agent" = "--agent",
): Result<CodexNativeAgentCapability, never> {
  return ok({
    canExecuteCustomAgent: true,
    selectorFlag,
    source: "injected",
    detail: `Injected Codex custom-agent selector ${selectorFlag}.`,
  });
}
