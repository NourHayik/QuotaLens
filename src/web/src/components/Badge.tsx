import type { FC } from "react";
import type { ProviderStatus } from "../types.js";

export interface BadgeProps {
  status?: ProviderStatus | "stale";
  label?: string;
  variant?: "ok" | "unsupported" | "stale" | "error" | "neutral";
}

export const Badge: FC<BadgeProps> = ({ status, label, variant }) => {
  let computedVariant = variant ?? "neutral";
  let text = label ?? status ?? "";

  if (status) {
    switch (status) {
      case "ok":
        computedVariant = "ok";
        text = label ?? "Active";
        break;
      case "unsupported":
        computedVariant = "unsupported";
        text = label ?? "Unsupported";
        break;
      case "stale":
        computedVariant = "stale";
        text = label ?? "Stale";
        break;
      case "timeout":
        computedVariant = "error";
        text = label ?? "Timeout";
        break;
      case "not_authenticated":
        computedVariant = "error";
        text = label ?? "Auth Required";
        break;
      case "not_installed":
        computedVariant = "neutral";
        text = label ?? "Not Installed";
        break;
      case "parse_error":
        computedVariant = "error";
        text = label ?? "Parse Error";
        break;
      case "partial":
        computedVariant = "stale";
        text = label ?? "Partial";
        break;
      default:
        computedVariant = "neutral";
        text = label ?? status;
    }
  }

  return (
    <span className={`badge badge-${computedVariant}`} role="status">
      {text}
    </span>
  );
};
