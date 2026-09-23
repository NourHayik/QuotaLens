import type { FC } from "react";
import type { UsageLimit } from "../types.js";

export interface UsageLimitBarProps {
  limit: UsageLimit;
}

function formatCountdown(seconds?: number): string | null {
  if (seconds === undefined || seconds === null || seconds <= 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export const UsageLimitBar: FC<UsageLimitBarProps> = ({ limit }) => {
  const used = limit.used_percent ?? 0;
  const remaining = limit.remaining_percent ?? Math.max(0, 100 - used);
  const countdownText = formatCountdown(limit.reset_countdown_seconds);

  let colorClass = "progress-green";
  if (used >= 90) {
    colorClass = "progress-red";
  } else if (used >= 70) {
    colorClass = "progress-amber";
  }

  const displayName = limit.name ?? limit.id;

  return (
    <div className="limit-item">
      <div className="limit-header">
        <span className="limit-name">{displayName}</span>
        <span
          className="limit-percent"
          style={{ color: `var(--${colorClass.replace("progress-", "")})` }}
        >
          {used}% used
        </span>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${displayName}: ${used}% used, ${remaining}% remaining`}
      >
        <div
          className={`progress-bar ${colorClass}`}
          style={{ width: `${Math.min(100, Math.max(0, used))}%` }}
        />
      </div>

      <div className="limit-footer">
        <span>
          {limit.used_amount !== undefined && limit.limit_amount !== undefined
            ? `${limit.used_amount} / ${limit.limit_amount} ${limit.amount_unit ?? ""}`.trim()
            : `${remaining}% remaining`}
        </span>
        {countdownText && (
          <span className="countdown" title={limit.resets_at ?? ""}>
            Resets in {countdownText}
          </span>
        )}
      </div>
    </div>
  );
};
