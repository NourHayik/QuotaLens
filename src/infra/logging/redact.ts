const REDACTED = "[REDACTED]";

/**
 * Patterns for common secret shapes. Applied to every logged string.
 * Keep this list conservative: redact liberally, never log env dumps.
 */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  // Authorization headers / bearer tokens
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /authorization["'\s:=]+[^\s,"']+/gi,
  // API keys and tokens in key=value or JSON-ish shapes
  /(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|client[_-]?secret)["'\s:=]+[^\s,"'}]+/gi,
  // Cookies
  /(?:cookie|set-cookie)["'\s:=]+[^\n]+/gi,
  // Env-style secrets: SOMETHING_TOKEN=..., SOMETHING_SECRET=..., SOMETHING_PASSWORD=...
  /\b[a-z0-9_]*(?:_token|_secret|_password|_apikey|_api_key)\b\s*[=:]\s*[^\s,"']+/gi,
  // OpenAI-style keys
  /\bsk-[a-z0-9_-]{8,}\b/gi,
  // Compact JWTs
  /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
];

/** Redact known secret patterns from a string. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      // Preserve the key name for key=value shapes so logs stay debuggable.
      const eq = match.search(/[=:]/);
      if (eq > 0 && eq < match.length - 1 && !match.toLowerCase().startsWith("bearer")) {
        return `${match.slice(0, eq + 1)}${REDACTED}`;
      }
      return REDACTED;
    });
  }
  return out;
}

/** Deep-redact secrets from an arbitrary log context value. */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/(token|secret|password|cookie|authorization|api[_-]?key)/i.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactValue(entry);
      }
    }
    return out;
  }
  return value;
}
