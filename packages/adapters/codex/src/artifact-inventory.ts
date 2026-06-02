import { basename, join } from "node:path";
import { okAsync, type ResultAsync } from "neverthrow";
import {
  CODEX_MARKETPLACE_PATH,
  CODEX_PLUGIN_RELATIVE_PATH,
  WEAVE_MANAGED_MARKER,
} from "./constants.js";
import type { CodexFileSystem, CodexFileSystemError } from "./filesystem.js";

export type CodexArtifactState =
  | "missing"
  | "owned"
  | "foreign"
  | "stale-owned";

export type CodexArtifactCollision = {
  readonly type: "CodexArtifactCollision";
  readonly path: string;
  readonly message: string;
};

export type CodexArtifactInventoryEntry = {
  readonly path: string;
  readonly state: CodexArtifactState;
};

export type CodexArtifactInventoryResult = {
  readonly entries: readonly CodexArtifactInventoryEntry[];
  readonly staleOwned: readonly string[];
  readonly collisions: readonly CodexArtifactCollision[];
  readonly deleted: readonly string[];
};

export type CodexArtifactInventoryError = {
  readonly type: "CodexFileSystemError";
  readonly error: CodexFileSystemError;
};

export function inventoryCodexArtifacts(input: {
  readonly fs: CodexFileSystem;
  readonly projectRoot: string;
  readonly currentAgentNames: readonly string[];
  readonly prune?: boolean;
}): ResultAsync<CodexArtifactInventoryResult, CodexArtifactInventoryError> {
  const expected = expectedArtifactPaths(input);
  const agentDir = input.fs.resolvePath(
    join(input.projectRoot, ".codex/agents"),
  );
  const pluginRoot = input.fs.resolvePath(
    join(input.projectRoot, CODEX_PLUGIN_RELATIVE_PATH),
  );

  return input.fs
    .listFiles(agentDir)
    .orElse(() => okAsync<string[], CodexFileSystemError>([]))
    .andThen((agentFiles) =>
      input.fs
        .listFiles(pluginRoot)
        .orElse(() => okAsync<string[], CodexFileSystemError>([]))
        .map((pluginFiles) => [...agentFiles, ...pluginFiles]),
    )
    .andThen((listedFiles) =>
      classifyFiles({
        fs: input.fs,
        listedFiles: [
          ...new Set([
            ...expected,
            ...listedFiles,
            input.fs.resolvePath(
              join(input.projectRoot, CODEX_MARKETPLACE_PATH),
            ),
          ]),
        ],
        expected: new Set(expected),
      }),
    )
    .andThen((entries) => {
      if (input.prune !== true) {
        return okAsync({
          entries,
          staleOwned: entries
            .filter((entry) => entry.state === "stale-owned")
            .map((entry) => entry.path),
          collisions: collisionsFromEntries(entries),
          deleted: [],
        });
      }

      return deleteStaleFiles(input.fs, entries).map((deleted) => ({
        entries,
        staleOwned: entries
          .filter((entry) => entry.state === "stale-owned")
          .map((entry) => entry.path),
        collisions: collisionsFromEntries(entries),
        deleted,
      }));
    })
    .mapErr(
      (error): CodexArtifactInventoryError => ({
        type: "CodexFileSystemError",
        error,
      }),
    );
}

function expectedArtifactPaths(input: {
  readonly fs: CodexFileSystem;
  readonly projectRoot: string;
  readonly currentAgentNames: readonly string[];
}): string[] {
  const root = input.projectRoot;
  return [
    ...input.currentAgentNames.map((agentName) =>
      input.fs.resolvePath(join(root, ".codex/agents", `${agentName}.toml`)),
    ),
    input.fs.resolvePath(join(root, CODEX_MARKETPLACE_PATH)),
    input.fs.resolvePath(join(root, CODEX_PLUGIN_RELATIVE_PATH, "hooks.json")),
    input.fs.resolvePath(
      join(root, CODEX_PLUGIN_RELATIVE_PATH, ".codex-plugin/plugin.json"),
    ),
    input.fs.resolvePath(join(root, CODEX_PLUGIN_RELATIVE_PATH, ".mcp.json")),
    input.fs.resolvePath(join(root, CODEX_PLUGIN_RELATIVE_PATH, ".app.json")),
    input.fs.resolvePath(
      join(root, CODEX_PLUGIN_RELATIVE_PATH, "skills/weave/SKILL.md"),
    ),
  ];
}

function classifyFiles(input: {
  readonly fs: CodexFileSystem;
  readonly listedFiles: readonly string[];
  readonly expected: ReadonlySet<string>;
}): ResultAsync<CodexArtifactInventoryEntry[], CodexFileSystemError> {
  let chain = okAsync<CodexArtifactInventoryEntry[], CodexFileSystemError>([]);
  for (const file of input.listedFiles) {
    chain = chain.andThen((entries) =>
      input.fs.exists(file).andThen((exists) => {
        if (!exists)
          return okAsync([
            ...entries,
            { path: file, state: "missing" as const },
          ]);

        return input.fs.readText(file).map((content) => {
          const owned = content.includes(WEAVE_MANAGED_MARKER);
          if (!owned && input.expected.has(file)) {
            return [...entries, { path: file, state: "foreign" as const }];
          }

          if (
            owned &&
            !input.expected.has(file) &&
            basename(file).endsWith(".toml")
          ) {
            return [...entries, { path: file, state: "stale-owned" as const }];
          }

          return [...entries, { path: file, state: "owned" as const }];
        });
      }),
    );
  }
  return chain;
}

function deleteStaleFiles(
  fs: CodexFileSystem,
  entries: readonly CodexArtifactInventoryEntry[],
): ResultAsync<string[], CodexFileSystemError> {
  let chain = okAsync<string[], CodexFileSystemError>([]);
  for (const entry of entries) {
    if (entry.state !== "stale-owned") continue;
    chain = chain.andThen((deleted) =>
      fs.deleteFile(entry.path).map(() => [...deleted, entry.path]),
    );
  }
  return chain;
}

function collisionsFromEntries(
  entries: readonly CodexArtifactInventoryEntry[],
): CodexArtifactCollision[] {
  return entries
    .filter((entry) => entry.state === "foreign")
    .map((entry) => ({
      type: "CodexArtifactCollision" as const,
      path: entry.path,
      message: `Codex artifact ${entry.path} is not Weave-managed.`,
    }));
}
