import { type FileReader, loadConfig } from "@weave/config";
import {
  logger,
  type MaterializationPlan,
  materializeAgents,
  resolveSkillsForConfig,
} from "@weave/engine";
import {
  err,
  ok,
  ResultAsync,
  type ResultAsync as ResultAsyncType,
} from "neverthrow";
import { CodexAdapter, type CodexAdapterOptions } from "./adapter.js";
import {
  type CodexArtifactInventoryResult,
  inventoryCodexArtifacts,
} from "./artifact-inventory.js";
import { BunCodexFileSystem } from "./filesystem.js";
import { safeCodexFileStem } from "./path-utils.js";

const log = logger.child({ module: "adapter-codex/materialize-project" });

export type MaterializeCodexProjectError =
  | { type: "ConfigLoadError"; cause: unknown }
  | { type: "MaterializationError"; errors: unknown[] }
  | { type: "AdapterError"; cause: unknown };

export type MaterializeCodexProjectResult = {
  agentCount: number;
  materializationErrorCount: number;
  artifactInventory: CodexArtifactInventoryResult;
  agentArtifacts: CodexAgentArtifact[];
};

export type CodexAgentArtifact = {
  name: string;
  path: string;
  content: string;
};

export function materializeCodexProject(input: {
  projectRoot: string;
  adapterOptions?: Omit<CodexAdapterOptions, "projectRoot">;
  fileReader?: FileReader;
  pruneGenerated?: boolean;
}): ResultAsyncType<
  MaterializeCodexProjectResult,
  MaterializeCodexProjectError
> {
  return loadConfig(input.projectRoot, input.fileReader)
    .mapErr((cause) => ({ type: "ConfigLoadError" as const, cause }))
    .andThen((config) =>
      materializeAgents({ config })
        .mapErr((cause) => ({ type: "AdapterError" as const, cause }))
        .andThen((plan) =>
          runCodexMaterialization({
            plan,
            config,
            projectRoot: input.projectRoot,
            adapterOptions: input.adapterOptions,
            pruneGenerated: input.pruneGenerated,
          }),
        ),
    );
}

function runCodexMaterialization(input: {
  plan: MaterializationPlan;
  config: Parameters<typeof resolveSkillsForConfig>[0]["config"];
  projectRoot: string;
  adapterOptions?: Omit<CodexAdapterOptions, "projectRoot">;
  pruneGenerated?: boolean;
}): ResultAsyncType<
  MaterializeCodexProjectResult,
  MaterializeCodexProjectError
> {
  return ResultAsync.fromPromise(
    runCodexMaterializationUnsafe(input),
    (cause): MaterializeCodexProjectError => ({ type: "AdapterError", cause }),
  ).andThen((result) => result);
}

async function runCodexMaterializationUnsafe(input: {
  plan: MaterializationPlan;
  config: Parameters<typeof resolveSkillsForConfig>[0]["config"];
  projectRoot: string;
  adapterOptions?: Omit<CodexAdapterOptions, "projectRoot">;
  pruneGenerated?: boolean;
}) {
  const fs = input.adapterOptions?.fs ?? new BunCodexFileSystem();
  const adapter = new CodexAdapter({
    ...input.adapterOptions,
    fs,
    projectRoot: input.projectRoot,
  });

  await adapter.init();
  const availableSkills = await adapter.loadAvailableSkills();
  const skillResult = resolveSkillsForConfig({
    config: input.config,
    availableSkills,
  });

  if (skillResult.isErr()) {
    return err<MaterializeCodexProjectResult, MaterializeCodexProjectError>({
      type: "MaterializationError",
      errors: skillResult.error,
    });
  }

  for (const { descriptor } of input.plan.agents) {
    await adapter.spawnSubagent(descriptor);
  }

  const agentArtifacts: CodexAgentArtifact[] = [];
  for (const { descriptor } of input.plan.agents) {
    const path = adapter.writtenAgents.get(descriptor.name);
    if (path === undefined) continue;

    const content = await fs.readText(path);
    if (content.isErr()) {
      return err<MaterializeCodexProjectResult, MaterializeCodexProjectError>({
        type: "AdapterError",
        cause: content.error,
      });
    }

    agentArtifacts.push({
      name: safeCodexFileStem(descriptor.name),
      path,
      content: content.value,
    });
  }

  const artifactInventory = await inventoryCodexArtifacts({
    fs,
    projectRoot: input.projectRoot,
    currentAgentNames: input.plan.agents.map((agent) => agent.agentName),
    prune: input.pruneGenerated,
  });
  if (artifactInventory.isErr()) {
    return err<MaterializeCodexProjectResult, MaterializeCodexProjectError>({
      type: "AdapterError",
      cause: artifactInventory.error,
    });
  }

  if (input.plan.errors.length > 0) {
    log.warn(
      { count: input.plan.errors.length },
      "Codex materialization completed with partial descriptor errors",
    );
  }

  return ok<MaterializeCodexProjectResult, MaterializeCodexProjectError>({
    agentCount: input.plan.agents.length,
    materializationErrorCount: input.plan.errors.length,
    artifactInventory: artifactInventory.value,
    agentArtifacts,
  });
}
