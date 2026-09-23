/** Allowed argv sequences for the Antigravity connector. Empty args are the PTY session. */
export const ANTIGRAVITY_ALLOWED_ARGS: ReadonlyArray<readonly string[]> = [
  ["--version"],
  ["models"],
  [],
];
