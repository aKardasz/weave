import { ResultAsync } from "neverthrow";

export type CodexProcessRunResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type CodexProcessRunError = {
  readonly type: "CodexProcessRunError";
  readonly command: string;
  readonly args: readonly string[];
  readonly cause: unknown;
};

export interface CodexProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options?: { readonly cwd?: string; readonly env?: Record<string, string> },
  ): ResultAsync<CodexProcessRunResult, CodexProcessRunError>;
}

export class BunCodexProcessRunner implements CodexProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd?: string;
      readonly env?: Record<string, string>;
    } = {},
  ): ResultAsync<CodexProcessRunResult, CodexProcessRunError> {
    return ResultAsync.fromPromise(
      runProcess(command, args, options),
      (cause): CodexProcessRunError => ({
        type: "CodexProcessRunError",
        command,
        args,
        cause,
      }),
    );
  }
}

async function runProcess(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly env?: Record<string, string> },
): Promise<CodexProcessRunResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env === undefined ? undefined : { ...Bun.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}
