/** Allowed argv sequences for the Kimi connector. Empty args are the PTY session. */
export const KIMI_ALLOWED_ARGS: ReadonlyArray<readonly string[]> = [
  ["--version"],
  ["provider", "list"],
  [],
];
