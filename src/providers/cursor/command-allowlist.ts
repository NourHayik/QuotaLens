/** Allowed argv sequences for the Cursor connector. */
export const CURSOR_ALLOWED_ARGS: ReadonlyArray<readonly string[]> = [
  ["--version"],
  ["status"],
  ["status", "--format", "json"],
  ["--help"],
  ["about"],
  ["about", "--format", "json"],
  ["usage", "--format", "json"],
];
