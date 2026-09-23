import { z } from "zod";

/** Non-secret error/warning attached to a provider snapshot. */
export const providerErrorSchema = z.object({
  /** Stable machine-readable code, e.g. "timeout", "parse_error", "auth_required". */
  code: z.string().min(1),
  /** Concise, non-secret, human-readable message. */
  message: z.string().min(1),
});
export type ProviderError = z.infer<typeof providerErrorSchema>;

/** Error thrown when a provider's local output format has drifted or cannot be parsed. */
export class ProviderParseError extends Error {
  readonly providerId: string;

  constructor(providerId: string, message: string) {
    super(message);
    this.name = "ProviderParseError";
    this.providerId = providerId;
  }
}
