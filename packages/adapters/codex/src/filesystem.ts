import { dirname, resolve } from "node:path";
import { errAsync, okAsync, ResultAsync } from "neverthrow";

type FileSystemErrorCause =
  | { kind: "MissingFile" }
  | { kind: "RuntimeFailure"; message: string };

export type CodexFileSystemError = {
  type: "CodexFileSystemError";
  operation: "exists" | "read" | "write" | "mkdir";
  path: string;
  cause: FileSystemErrorCause;
};

export interface CodexFileSystem {
  exists(path: string): ResultAsync<boolean, CodexFileSystemError>;
  readText(path: string): ResultAsync<string, CodexFileSystemError>;
  writeText(
    path: string,
    content: string,
  ): ResultAsync<void, CodexFileSystemError>;
  mkdir(path: string): ResultAsync<void, CodexFileSystemError>;
  cwd(): string;
  home(): string;
  resolvePath(path: string): string;
}

function normalizeRuntimeFailure(cause: unknown): FileSystemErrorCause {
  if (cause instanceof Error) {
    return { kind: "RuntimeFailure", message: cause.message };
  }
  if (typeof cause === "string") {
    return { kind: "RuntimeFailure", message: cause };
  }
  return { kind: "RuntimeFailure", message: String(cause) };
}

function isMissingFileCause(cause: unknown): boolean {
  if (cause instanceof Error && cause.message.includes("ENOENT")) return true;
  if (typeof cause !== "object" || cause === null) return false;
  const error = cause as { code?: unknown; errno?: unknown };
  if (error.code === "ENOENT") return true;
  return error.errno === -2;
}

function toError(
  operation: CodexFileSystemError["operation"],
  path: string,
): (cause: unknown) => CodexFileSystemError {
  return (cause) => ({
    type: "CodexFileSystemError",
    operation,
    path,
    cause: normalizeRuntimeFailure(cause),
  });
}

function toReadError(path: string): (cause: unknown) => CodexFileSystemError {
  return (cause) => {
    if (isMissingFileCause(cause)) {
      return {
        type: "CodexFileSystemError",
        operation: "read",
        path,
        cause: { kind: "MissingFile" },
      };
    }
    return toError("read", path)(cause);
  };
}

export class BunCodexFileSystem implements CodexFileSystem {
  cwd(): string {
    const runtime = Bun as typeof Bun & { cwd?: string };
    return runtime.cwd ?? ".";
  }

  home(): string {
    return Bun.env.HOME ?? "/tmp";
  }

  resolvePath(path: string): string {
    if (path === "~") return this.home();
    if (path.startsWith("~/")) return resolve(this.home(), path.slice(2));
    return resolve(this.cwd(), path);
  }

  exists(path: string): ResultAsync<boolean, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    return ResultAsync.fromPromise(
      Bun.file(resolved).exists(),
      toError("exists", resolved),
    );
  }

  readText(path: string): ResultAsync<string, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    return ResultAsync.fromPromise(
      Bun.file(resolved).text(),
      toReadError(resolved),
    );
  }

  writeText(
    path: string,
    content: string,
  ): ResultAsync<void, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    return this.mkdir(dirname(resolved)).andThen(() =>
      ResultAsync.fromPromise(
        Bun.write(resolved, content).then(() => undefined),
        toError("write", resolved),
      ),
    );
  }

  mkdir(path: string): ResultAsync<void, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    return ResultAsync.fromPromise(
      Bun.$`mkdir -p ${resolved}`.quiet().then(() => undefined),
      toError("mkdir", resolved),
    );
  }
}

export class MemoryCodexFileSystem implements CodexFileSystem {
  private readonly files = new Map<string, string>();
  private readonly dirs = new Set<string>();

  constructor(
    initialFiles: Record<string, string> = {},
    private readonly currentDirectory = "/project",
    private readonly homeDirectory = "/home/user",
  ) {
    for (const [path, content] of Object.entries(initialFiles)) {
      const resolved = this.resolvePath(path);
      this.files.set(resolved, content);
      this.ensureDirsExist(dirname(resolved));
    }
  }

  cwd(): string {
    return this.currentDirectory;
  }

  home(): string {
    return this.homeDirectory;
  }

  resolvePath(path: string): string {
    if (path === "~") return this.homeDirectory;
    if (path.startsWith("~/"))
      return resolve(this.homeDirectory, path.slice(2));
    return resolve(this.currentDirectory, path);
  }

  exists(path: string): ResultAsync<boolean, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    return okAsync(this.files.has(resolved) || this.dirs.has(resolved));
  }

  readText(path: string): ResultAsync<string, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    const content = this.files.get(resolved);
    if (content === undefined) {
      return errAsync({
        type: "CodexFileSystemError",
        operation: "read",
        path: resolved,
        cause: { kind: "MissingFile" },
      });
    }
    return okAsync(content);
  }

  writeText(
    path: string,
    content: string,
  ): ResultAsync<void, CodexFileSystemError> {
    const resolved = this.resolvePath(path);
    this.ensureDirsExist(dirname(resolved));
    this.files.set(resolved, content);
    return okAsync(undefined);
  }

  mkdir(path: string): ResultAsync<void, CodexFileSystemError> {
    this.ensureDirsExist(this.resolvePath(path));
    return okAsync(undefined);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files.entries());
  }

  private ensureDirsExist(path: string): void {
    let current = resolve(path);
    while (!this.dirs.has(current)) {
      this.dirs.add(current);
      const parent = dirname(current);
      if (parent === current) return;
      current = parent;
    }
  }
}
