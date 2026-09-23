import { CommandNotAllowedError } from "./errors.js";

/**
 * Returns true when `actual` is exactly equal to one allowed argv sequence.
 */
export function argsMatchAllowed(
  actual: readonly string[],
  allowed: ReadonlyArray<readonly string[]>,
): boolean {
  return allowed.some(
    (sequence) =>
      sequence.length === actual.length &&
      sequence.every((token, index) => token === actual[index]),
  );
}

/**
 * Connectors must spawn only known argv sequences. Rejects anything else
 * before `child_process.spawn` so user- or API-supplied commands cannot run.
 */
export function assertAllowedArgs(
  providerId: string,
  args: readonly string[],
  allowed: ReadonlyArray<readonly string[]>,
): void {
  if (argsMatchAllowed(args, allowed)) {
    return;
  }
  throw new CommandNotAllowedError(providerId, args);
}
