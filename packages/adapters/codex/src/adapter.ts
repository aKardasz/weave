import { join } from "node:path";
import { BunFilesystemPlanStateProvider } from "@weave/config";
import type {
  AgentDescriptor,
  HarnessAdapter,
  PlanStateProvider,
  SkillInfo,
} from "@weave/engine";
import { logger } from "@weave/engine";
import {
  CODEX_MARKETPLACE_PATH,
  CODEX_PLUGIN_RELATIVE_PATH,
  WEAVE_CODEX_PLUGIN_NAME,
} from "./constants.js";
import { BunCodexFileSystem, type CodexFileSystem } from "./filesystem.js";
import {
  type CodexModelContext,
  resolveCodexModelForAgent,
} from "./model-resolution.js";
import { type ManagedWriteError, writeManagedFile } from "./ownership.js";
import { safeCodexFileStem } from "./path-utils.js";
import { renderAgentToml, translateAgent } from "./render-agent.js";
import {
  renderAppManifest,
  renderHookManifest,
  renderMarketplace,
  renderMcpConfig,
  renderPluginManifest,
  renderSmokeApp,
  renderSmokeHookScript,
  renderSmokeMcpScript,
  renderWeaveSkill,
  renderWeaveSkillOpenAiMetadata,
} from "./render-plugin.js";
import { discoverCodexSkills } from "./skill-discovery.js";

const log = logger.child({ module: "adapter-codex" });

export type CodexAdapterErrorType =
  | "TranslateAgentError"
  | "WriteAgentError"
  | "WritePluginError"
  | "SkillDiscoveryError";

export class CodexAdapterError extends Error {
  readonly type: CodexAdapterErrorType;
  readonly cause: unknown;

  constructor(input: {
    type: CodexAdapterErrorType;
    message: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "CodexAdapterError";
    this.type = input.type;
    this.cause = input.cause;
  }
}

export interface CodexAdapterOptions {
  readonly projectRoot?: string;
  readonly fs?: CodexFileSystem;
  readonly force?: boolean;
  readonly modelContext?: CodexModelContext;
  readonly availableSkills?: SkillInfo[];
}

export class CodexAdapter implements HarnessAdapter {
  readonly writtenAgents = new Map<string, string>();
  planStateProvider: PlanStateProvider | undefined = undefined;

  private readonly projectRoot: string;
  private readonly fs: CodexFileSystem;
  private readonly force: boolean;
  private readonly modelContext: CodexModelContext;
  private readonly injectedSkills: SkillInfo[] | undefined;

  constructor(options: CodexAdapterOptions = {}) {
    this.fs = options.fs ?? new BunCodexFileSystem();
    this.projectRoot = this.fs.resolvePath(
      options.projectRoot ?? this.fs.cwd(),
    );
    this.force = options.force ?? false;
    this.modelContext = options.modelContext ?? {};
    this.injectedSkills = options.availableSkills;
  }

  get projectRootPath(): string {
    return this.projectRoot;
  }

  async init(): Promise<void> {
    this.planStateProvider = new BunFilesystemPlanStateProvider(
      this.projectRoot,
    );

    await this.materializePlugin();

    log.info({ projectRoot: this.projectRoot }, "CodexAdapter initialized");
  }

  async loadAvailableSkills(): Promise<SkillInfo[]> {
    if (this.injectedSkills !== undefined) {
      return [...this.injectedSkills];
    }

    const result = await discoverCodexSkills({
      fs: this.fs,
      projectRoot: this.projectRoot,
    });

    if (result.isErr()) {
      throw new CodexAdapterError({
        type: "SkillDiscoveryError",
        message: `Failed to discover Codex skills from ${result.error.path}`,
        cause: result.error,
      });
    }

    return result.value;
  }

  async spawnSubagent(descriptor: AgentDescriptor): Promise<void> {
    const resolvedModel = resolveCodexModelForAgent(
      descriptor,
      this.modelContext,
    );
    if (resolvedModel.isErr()) {
      throw new CodexAdapterError({
        type: "TranslateAgentError",
        message: resolvedModel.error.message,
        cause: resolvedModel.error,
      });
    }
    const translated = translateAgent(descriptor, resolvedModel.value);

    if (translated.isErr()) {
      throw new CodexAdapterError({
        type: "TranslateAgentError",
        message: translated.error.message,
        cause: translated.error,
      });
    }

    const path = join(
      this.projectRoot,
      ".codex/agents",
      `${safeCodexFileStem(descriptor.name)}.toml`,
    );

    const content = renderAgentToml(translated.value);
    const written = await writeManagedFile({
      fs: this.fs,
      path,
      content,
      force: this.force,
    });

    if (written.isErr()) {
      throw new CodexAdapterError({
        type: "WriteAgentError",
        message: formatManagedWriteError(written.error),
        cause: written.error,
      });
    }

    this.writtenAgents.set(descriptor.name, this.fs.resolvePath(path));
  }

  private async materializePlugin(): Promise<void> {
    const pluginRoot = join(this.projectRoot, CODEX_PLUGIN_RELATIVE_PATH);
    const writes = [
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, ".codex-plugin/plugin.json"),
        content: renderPluginManifest(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "skills/weave/SKILL.md"),
        content: renderWeaveSkill(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "skills/weave/agents/openai.yaml"),
        content: renderWeaveSkillOpenAiMetadata(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "hooks.json"),
        content: renderHookManifest(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "hooks/hooks.json"),
        content: renderHookManifest(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "hooks/weave-smoke-hook.ts"),
        content: renderSmokeHookScript(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "assets/.gitkeep"),
        content: "# weave-managed\n",
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, ".mcp.json"),
        content: renderMcpConfig(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "mcp/weave-smoke-mcp.ts"),
        content: renderSmokeMcpScript(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, ".app.json"),
        content: renderAppManifest(),
        force: this.force,
      }),
      writeManagedFile({
        fs: this.fs,
        path: join(pluginRoot, "apps/weave-smoke-app.json"),
        content: renderSmokeApp(),
        force: this.force,
      }),
    ];

    for (const writeResult of writes) {
      const result = await writeResult;
      if (result.isErr()) {
        throw new CodexAdapterError({
          type: "WritePluginError",
          message: formatManagedWriteError(result.error),
          cause: result.error,
        });
      }
    }

    await this.writeMarketplace();
  }

  private async writeMarketplace(): Promise<void> {
    const marketplacePath = join(this.projectRoot, CODEX_MARKETPLACE_PATH);
    const exists = await this.fs.exists(marketplacePath);
    if (exists.isErr()) {
      throw new CodexAdapterError({
        type: "WritePluginError",
        message: `Failed to check ${marketplacePath}`,
        cause: exists.error,
      });
    }

    let existingContent: string | undefined;
    if (exists.value) {
      const existing = await this.fs.readText(marketplacePath);
      if (existing.isErr()) {
        throw new CodexAdapterError({
          type: "WritePluginError",
          message: `Failed to read ${marketplacePath}`,
          cause: existing.error,
        });
      }
      existingContent = existing.value;
    }

    const result = await writeManagedFile({
      fs: this.fs,
      path: marketplacePath,
      content: renderMarketplace(existingContent),
      force: this.force,
    });

    if (result.isErr()) {
      throw new CodexAdapterError({
        type: "WritePluginError",
        message: formatManagedWriteError(result.error),
        cause: result.error,
      });
    }

    log.info({ plugin: WEAVE_CODEX_PLUGIN_NAME }, "Codex plugin materialized");
  }
}

function formatManagedWriteError(error: ManagedWriteError): string {
  switch (error.type) {
    case "CodexFileSystemError":
      return `Codex filesystem ${error.error.operation} failed for ${error.error.path}`;
    case "ForeignFileCollision":
      return error.message;
  }
}
