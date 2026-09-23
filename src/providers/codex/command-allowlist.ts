/** Allowed argv sequences for the Codex connector. Never spawn anything else. */
export const CODEX_ALLOWED_ARGS: ReadonlyArray<readonly string[]> = [
  ["--version"],
  ["login", "status"],
  ["app-server", "--stdio"],
];
