import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import { WEAVE_MANAGED_MARKER } from "./constants.js";
import type { CodexFileSystem, CodexFileSystemError } from "./filesystem.js";

export type ManagedWriteError =
  | {
      type: "CodexFileSystemError";
      error: CodexFileSystemError;
    }
  | {
      type: "ForeignFileCollision";
      path: string;
      message: string;
    };

export function writeManagedFile(input: {
  fs: CodexFileSystem;
  path: string;
  content: string;
  force?: boolean;
}): ResultAsync<void, ManagedWriteError> {
  return input.fs
    .exists(input.path)
    .mapErr((error) => ({ type: "CodexFileSystemError" as const, error }))
    .andThen((exists) => {
      if (!exists || input.force === true) {
        return write(input.fs, input.path, input.content);
      }

      return input.fs
        .readText(input.path)
        .mapErr((error) => ({ type: "CodexFileSystemError" as const, error }))
        .andThen((existingContent) => {
          if (existingContent.includes(WEAVE_MANAGED_MARKER)) {
            return write(input.fs, input.path, input.content);
          }

          return errAsync<void, ManagedWriteError>({
            type: "ForeignFileCollision",
            path: input.fs.resolvePath(input.path),
            message: `Refusing to overwrite ${input.fs.resolvePath(input.path)} because it is not marked as Weave-managed.`,
          });
        });
    });
}

function write(
  fs: CodexFileSystem,
  path: string,
  content: string,
): ResultAsync<void, ManagedWriteError> {
  return fs
    .writeText(path, content)
    .mapErr(
      (error): ManagedWriteError => ({
        type: "CodexFileSystemError",
        error,
      }),
    )
    .andThen(() => okAsync(undefined));
}
