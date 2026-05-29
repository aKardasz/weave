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

const log = logger.child({ module: "adapter-codex/materialize-project" });

export type MaterializeCodexProjectError =
  | { type: "ConfigLoadError"; cause: unknown }
  | { type: "MaterializationError"; errors: unknown[] }
  | { type: "AdapterError"; cause: unknown };

export type MaterializeCodexProjectResult = {
  agentCount: number;
  materializationErrorCount: number;
};

export function materializeCodexProject(input: {
  projectRoot: string;
  adapterOptions?: Omit<CodexAdapterOptions, "projectRoot">;
  fileReader?: FileReader;
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
          }),
        ),
    );
}

function runCodexMaterialization(input: {
  plan: MaterializationPlan;
  config: Parameters<typeof resolveSkillsForConfig>[0]["config"];
  projectRoot: string;
  adapterOptions?: Omit<CodexAdapterOptions, "projectRoot">;
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
}) {
  const adapter = new CodexAdapter({
    ...input.adapterOptions,
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

  if (input.plan.errors.length > 0) {
    log.warn(
      { count: input.plan.errors.length },
      "Codex materialization completed with partial descriptor errors",
    );
  }

  return ok<MaterializeCodexProjectResult, MaterializeCodexProjectError>({
    agentCount: input.plan.agents.length,
    materializationErrorCount: input.plan.errors.length,
  });
}
