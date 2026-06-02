import type { AdapterCapabilityContract, CapabilityEntry } from "@weave/engine";

function capability(
  id: CapabilityEntry["id"],
  readiness: CapabilityEntry["readiness"],
  description: string,
  notes: string,
): CapabilityEntry {
  return {
    id,
    readiness,
    description,
    notes,
    supplier: "codex",
  };
}

export function buildCodexCapabilityContract(): AdapterCapabilityContract {
  return {
    capabilities: [
      capability(
        "config-materialization",
        "emulated",
        "Codex project file materialization",
        "Writes repo-scoped .codex agents and a local plugin marketplace entry.",
      ),
      capability(
        "agent-materialization",
        "native",
        "Codex custom agents",
        "Materializes Weave agents as .codex/agents/*.toml files.",
      ),
      capability(
        "primary-agent-selection",
        "emulated",
        "Coordinator skill",
        "The generated weave skill guides users toward generated agents; Codex keeps one main session.",
      ),
      capability(
        "delegated-specialist-execution",
        "native",
        "Codex subagents",
        "Codex supports explicit subagent workflows and custom agent definitions.",
      ),
      capability(
        "prompt-composition",
        "native",
        "Codex developer instructions",
        "Engine-composed prompts become custom agent developer_instructions.",
      ),
      capability(
        "tool-policy-mapping",
        "degraded",
        "Instruction-level policy mapping",
        "Codex runtime permissions are inherited from the active session; v1 only encodes Weave policy as instructions and conservative sandbox overrides.",
      ),
      capability(
        "workflow-persistence",
        "emulated",
        "Weave Runtime Store persistence",
        "runCodexWorkflow drives engine lifecycle state through the shared Runtime Store; Codex native sessions are not event-sourced.",
      ),
      capability(
        "workflow-step-dispatch",
        "native",
        "Native Codex custom-agent execution",
        "Codex workflow runs probe for a non-interactive custom-agent selector, then execute steps through codex exec --json with the target generated agent.",
      ),
      capability(
        "plan-file-compatibility",
        "emulated",
        "Weave plan files",
        "Generated agents can read ordinary .weave/plans files.",
      ),
      capability(
        "command-entrypoints",
        "emulated",
        "Codex skill entrypoint",
        "The local plugin exposes a $weave skill entrypoint.",
      ),
      capability(
        "event-logging",
        "emulated",
        "Sanitized Codex exec event metadata",
        "Codex workflow runs parse JSON event streams and append sanitized event counts and usage summaries to the Runtime Journal; raw prompts and unrestricted stdout/stderr are not journaled.",
      ),
      capability(
        "token-usage-reporting",
        "degraded",
        "Best-effort Codex JSON usage events",
        "Token usage is parsed from codex exec --json events when present; missing usage is represented as CodexUsageUnavailable rather than failing the step.",
      ),
      capability(
        "static-artifact-generation",
        "native",
        "Generated files",
        "The adapter generates static Codex files and plugin metadata.",
      ),
    ],
  };
}
