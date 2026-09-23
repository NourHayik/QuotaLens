/** Allowed argv sequences for the OpenCode Go connector. */
export const OPENCODE_ALLOWED_ARGS: ReadonlyArray<readonly string[]> = [
  ["--version"],
  ["auth", "list"],
  ["--help"],
  ["usage", "--format", "json"],
];
