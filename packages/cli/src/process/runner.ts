import { ResultAsync } from "neverthrow";

export type ProcessRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ProcessRunError = {
  type: "ProcessRunError";
  command: string;
  args: string[];
  cause: unknown;
};

export interface ProcessRunner {
  run(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): ResultAsync<ProcessRunResult, ProcessRunError>;
}

export class BunProcessRunner implements ProcessRunner {
  run(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string> } = {},
  ): ResultAsync<ProcessRunResult, ProcessRunError> {
    return ResultAsync.fromPromise(
      runProcess(command, args, options),
      (cause): ProcessRunError => ({
        type: "ProcessRunError",
        command,
        args,
        cause,
      }),
    );
  }
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> },
): Promise<ProcessRunResult> {
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
