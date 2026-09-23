export interface OpenCodeAdapterOptions {
  executable?: string | undefined;
  timeoutMs?: number | undefined;
  commandRunner?:
    | ((
        args: string[],
        signal?: AbortSignal | undefined,
      ) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>)
    | undefined;
  now?: (() => Date) | undefined;
  /** Force capability for testing forward-compatible structured usage */
  forceSupportedUsage?: boolean | undefined;
  futureUsageRunner?: ((signal?: AbortSignal | undefined) => Promise<string>) | undefined;
  authPath?: string | undefined;
  apiBaseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}
