/**
 * Robust ANSI and terminal control sequence stripping for TUI output.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for terminal ANSI sequence stripping
const CSI_REGEX = /\x1b\[[0-?]*[ -/]*[@-~]/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for terminal OSC sequence stripping
const OSC_REGEX = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for terminal escape sequence stripping
const ESC_GENERIC_REGEX = /\x1b[@-Z\\-_]/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for terminal charset sequence stripping
const CHARSET_REGEX = /\x1b[()][AB012]/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for terminal control character stripping
const LOW_CONTROL_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g;

/**
 * Strips all ANSI escape sequences, OSC codes, and terminal controls from raw text.
 */
export function stripAnsi(text: string): string {
  if (!text) return "";

  return text
    .replace(OSC_REGEX, "")
    .replace(CSI_REGEX, "")
    .replace(CHARSET_REGEX, "")
    .replace(ESC_GENERIC_REGEX, "")
    .replace(LOW_CONTROL_REGEX, "");
}

/**
 * Strips ANSI codes and normalizes line endings (\r\n -> \n, standalone \r -> \n),
 * trimming trailing line whitespace.
 */
export function cleanTerminalOutput(text: string): string {
  const stripped = stripAnsi(text);
  return stripped
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}
