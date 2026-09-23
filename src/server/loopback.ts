/**
 * Loopback address validation.
 * Enforces the strict local-only constraint required by Section 4.1:
 * HTTP servers must bind ONLY to loopback (127.0.0.1, ::1, or localhost).
 * Any external host or interface (0.0.0.0, LAN IPs, public IPs, domain names) is rejected.
 */

const ALLOWED_LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);

export class NonLoopbackBindError extends Error {
  constructor(host: string) {
    super(
      `Security violation: Server binding is restricted to loopback addresses only (127.0.0.1 or ::1). Attempted to bind to "${host}".`,
    );
    this.name = "NonLoopbackBindError";
  }
}

/**
 * Validates that the provided host is strictly a loopback address.
 * Throws NonLoopbackBindError if non-loopback host is provided.
 */
export function assertLoopbackHost(host: string): void {
  const normalized = host.trim().toLowerCase();

  // Explicitly reject wildcard bindings
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "*") {
    throw new NonLoopbackBindError(host);
  }

  if (!ALLOWED_LOOPBACK_HOSTS.has(normalized)) {
    throw new NonLoopbackBindError(host);
  }
}

/**
 * Returns true if the host string is a valid loopback address.
 */
export function isLoopbackHost(host: string): boolean {
  try {
    assertLoopbackHost(host);
    return true;
  } catch {
    return false;
  }
}
