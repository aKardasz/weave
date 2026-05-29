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
    join(root, ".agents/skills/weave/SKILL.md"),
    join(dirname(root), ".agents/skills/weave/SKILL.md"),
    join(fs.home(), ".agents/skills/weave/SKILL.md"),
    "/etc/codex/skills/weave/SKILL.md",
  ];
}

async function discover(
  fs: CodexFileSystem,
  files: string[],
): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  for (const file of files) {
    const exists = await fs.exists(file);
    if (exists.isErr()) throw skillDiscoveryError(file, exists.error);
    if (!exists.value) continue;

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
