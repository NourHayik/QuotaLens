export interface CursorAdapterOptions {
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
  stateDbPath?: string | undefined;
  apiBaseUrl?: string | undefined;
  webBaseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface CursorStatusResponse {
  status?: string | undefined;
  isAuthenticated?: boolean | undefined;
  hasAccessToken?: boolean | undefined;
  hasRefreshToken?: boolean | undefined;
  userInfo?:
    | {
        email?: string | undefined;
        userId?: number | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
      }
    | undefined;
}

export interface CursorAboutResponse {
  cliVersion?: string | undefined;
  subscriptionTier?: string | undefined;
  latestStatus?: string | undefined;
  latestVersion?: string | undefined;
  model?: string | undefined;
}
