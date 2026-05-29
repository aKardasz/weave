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
        "unsupported",
        "No live workflow runtime",
        "The first slice does not implement Codex workflow persistence hooks.",
      ),
      capability(
        "workflow-step-dispatch",
        "unsupported",
        "No live workflow dispatcher",
        "The first slice does not dispatch workflow steps inside Codex.",
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
        "unsupported",
        "No Codex event integration",
        "The first slice does not observe Codex runtime events.",
      ),
      capability(
        "token-usage-reporting",
        "unsupported",
        "No usage integration",
        "No Codex usage reporting surface is wired in v1.",
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
