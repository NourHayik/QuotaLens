import type { FC } from "react";
import type { ProviderSnapshot } from "../types.js";
import { Badge } from "./Badge.js";
import { UsageLimitBar } from "./UsageLimitBar.js";

export interface ProviderCardProps {
  snapshot: ProviderSnapshot;
  isRefreshing?: boolean;
  onRefresh: (providerId: string) => void;
  onViewDetails: (providerId: string) => void;
}

export const ProviderCard: FC<ProviderCardProps> = ({
  snapshot,
  isRefreshing = false,
  onRefresh,
  onViewDetails,
}) => {
  const isUnsupported = snapshot.usage_capability === "unsupported";
  const hasLimits = snapshot.limits.length > 0;
  const isStale = snapshot.stale;
  const fetchTime = new Date(snapshot.fetched_at).toLocaleTimeString();

  return (
    <article className="provider-card" aria-label={`Provider ${snapshot.display_name}`}>
      <div>
        <div className="card-header">
          <div className="card-title-group">
            <h2 className="card-title">
              {snapshot.display_name}
              {snapshot.plan_label && (
                <span className="brand-badge" style={{ fontSize: "0.68rem" }}>
                  {snapshot.plan_label}
                </span>
              )}
            </h2>
            <span className="card-subtitle">
              {snapshot.id} {snapshot.cli_version ? `• v${snapshot.cli_version}` : ""}
            </span>
          </div>

          <div className="badges-row">
            {isStale && <Badge status="stale" label="Stale" />}
            <Badge status={snapshot.status} />
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          {isUnsupported ? (
            <div className="unsupported-box" role="status">
              <span className="unsupported-title">Usage Tracking Unsupported</span>
              <p className="unsupported-desc">
                {snapshot.errors[0]?.message ??
                  "This CLI version does not expose a deterministic local usage surface."}
              </p>
              <span className="zero-credit-tag">✓ Zero AI credits consumed</span>
            </div>
          ) : snapshot.status === "not_authenticated" ? (
            <div className="unsupported-box" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
              <span className="unsupported-title" style={{ color: "var(--amber)" }}>
                Authentication Required
              </span>
              <p className="unsupported-desc">
                Log into {snapshot.display_name} using its CLI to track usage limits.
              </p>
            </div>
          ) : snapshot.status === "not_installed" ? (
            <div className="unsupported-box" style={{ borderColor: "var(--border)" }}>
              <span className="unsupported-title" style={{ color: "var(--text-muted)" }}>
                Executable Not Detected
              </span>
              <p className="unsupported-desc">
                Install {snapshot.display_name} locally to enable automatic quota tracking.
              </p>
            </div>
          ) : hasLimits ? (
            <div className="limits-container">
              {snapshot.limits.map((limit) => (
                <UsageLimitBar key={limit.id} limit={limit} />
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", padding: "12px 0" }}>
              No active quota buckets reported.
            </div>
          )}
        </div>
      </div>

      <div className="card-footer">
        <span className="fetched-time" title={snapshot.fetched_at}>
          Updated {fetchTime}
        </span>

        <div className="card-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onViewDetails(snapshot.id)}
            aria-label={`View details and history for ${snapshot.display_name}`}
          >
            Details
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isRefreshing}
            onClick={() => onRefresh(snapshot.id)}
            aria-label={`Refresh ${snapshot.display_name}`}
          >
            <span className={isRefreshing ? "spin" : ""}>↻</span>
            {isRefreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
    </article>
  );
};
