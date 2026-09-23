export class ProcessTimeoutError extends Error {
  readonly executable: string;
  readonly timeoutMs: number;

  constructor(executable: string, timeoutMs: number) {
    super(`Process "${executable}" exceeded timeout of ${timeoutMs}ms and was terminated`);
    this.name = "ProcessTimeoutError";
    this.executable = executable;
    this.timeoutMs = timeoutMs;
  }
}

export class ProcessAbortedError extends Error {
  readonly executable: string;

  constructor(executable: string) {
    super(`Process "${executable}" was aborted`);
    this.name = "ProcessAbortedError";
    this.executable = executable;
  }
}

export class ProcessSpawnError extends Error {
  readonly executable: string;

  constructor(executable: string, cause: unknown) {
    super(
      `Failed to spawn "${executable}": ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "ProcessSpawnError";
    this.executable = executable;
    this.cause = cause;
  }
}

export class CommandNotAllowedError extends Error {
  readonly providerId: string;
  readonly args: readonly string[];

  constructor(providerId: string, args: readonly string[]) {
    super(
      `Command not allowed for provider "${providerId}": ${args.length === 0 ? "(no args)" : args.join(" ")}`,
    );
    this.name = "CommandNotAllowedError";
    this.providerId = providerId;
    this.args = args;
  }
}
