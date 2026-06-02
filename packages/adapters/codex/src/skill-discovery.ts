import { basename, dirname, join, resolve } from "node:path";
import type { SkillInfo } from "@weave/engine";
import { okAsync, ResultAsync } from "neverthrow";
import type { CodexFileSystem, CodexFileSystemError } from "./filesystem.js";

export type SkillDiscoveryError = {
  type: "SkillDiscoveryError";
  path: string;
  cause: CodexFileSystemError;
};

export function discoverCodexSkills(input: {
  fs: CodexFileSystem;
  projectRoot?: string;
  extraSkillFiles?: string[];
}): ResultAsync<SkillInfo[], SkillDiscoveryError> {
  const files = [
    ...defaultSkillFiles(input.fs, input.projectRoot),
    ...(input.extraSkillFiles ?? []),
  ];

  return ResultAsync.fromPromise(discover(input.fs, files), (cause) => {
    if (isSkillDiscoveryError(cause)) return cause;
    return {
      type: "SkillDiscoveryError",
      path: "(unknown)",
      cause: {
        type: "CodexFileSystemError",
        operation: "read",
        path: "(unknown)",
        cause: { kind: "RuntimeFailure", message: String(cause) },
      },
    } satisfies SkillDiscoveryError;
  }).andThen((skills) => okAsync(dedupeSkills(skills)));
}

function defaultSkillFiles(
  fs: CodexFileSystem,
  projectRoot: string | undefined,
): string[] {
  const root = fs.resolvePath(projectRoot ?? fs.cwd());
  return [
    join(root, ".agents/skills"),
    join(root, ".codex/skills"),
    join(root, "plugins/weave-codex/skills"),
    join(dirname(root), ".agents/skills"),
    join(dirname(root), ".codex/skills"),
    join(fs.home(), ".agents/skills"),
    join(fs.home(), ".codex/skills"),
    join(fs.home(), "plugins/weave-codex/skills"),
    "/etc/codex/skills",
  ];
}

async function discover(
  fs: CodexFileSystem,
  paths: string[],
): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  const files = await discoverSkillFiles(fs, paths);

  for (const file of files) {
    const content = await fs.readText(file);
    if (content.isErr()) throw skillDiscoveryError(file, content.error);

    skills.push({
      name: parseSkillName(content.value) ?? basename(dirname(resolve(file))),
      metadata: {
        path: fs.resolvePath(file),
        source: "codex",
        description: parseSkillDescription(content.value),
      },
    });
  }

  return skills;
}

async function discoverSkillFiles(
  fs: CodexFileSystem,
  paths: string[],
): Promise<string[]> {
  const files: string[] = [];

  for (const path of paths) {
    const resolved = fs.resolvePath(path);
    if (basename(resolved) === "SKILL.md") {
      const exists = await fs.exists(resolved);
      if (exists.isErr()) throw skillDiscoveryError(resolved, exists.error);
      if (exists.value) files.push(resolved);
      continue;
    }

    const listed = await fs.listFiles(resolved);
    if (listed.isErr()) {
      if (isMissingSkillRoot(listed.error)) continue;
      throw skillDiscoveryError(resolved, listed.error);
    }

    for (const file of listed.value) {
      if (basename(file) === "SKILL.md") files.push(fs.resolvePath(file));
    }
  }

  return files;
}

function isMissingSkillRoot(error: CodexFileSystemError): boolean {
  if (error.cause.kind === "MissingFile") return true;
  if (error.operation !== "list") return false;
  return error.cause.message.includes("ENOENT");
}

function parseSkillName(content: string): string | undefined {
  const frontmatter = frontmatterBlock(content);
  const match = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  return match?.[1]?.trim();
}

function parseSkillDescription(content: string): string | undefined {
  const frontmatter = frontmatterBlock(content);
  const match = frontmatter.match(/^description:\s*["']?([^"'\n]+)["']?\s*$/m);
  return match?.[1]?.trim();
}

function frontmatterBlock(content: string): string {
  if (!content.startsWith("---")) return "";
  const end = content.indexOf("\n---", 3);
  if (end === -1) return "";
  return content.slice(3, end);
}

function dedupeSkills(skills: SkillInfo[]): SkillInfo[] {
  const seen = new Set<string>();
  const deduped: SkillInfo[] = [];
  for (const skill of skills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    deduped.push(skill);
  }
  return deduped;
}

function skillDiscoveryError(
  path: string,
  cause: CodexFileSystemError,
): SkillDiscoveryError {
  return { type: "SkillDiscoveryError", path, cause };
}

function isSkillDiscoveryError(cause: unknown): cause is SkillDiscoveryError {
  if (typeof cause !== "object" || cause === null) return false;
  return (cause as { type?: unknown }).type === "SkillDiscoveryError";
}
