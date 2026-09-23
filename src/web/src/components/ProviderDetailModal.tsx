import { type FC, useEffect, useRef, useState } from "react";
import type { HistoryRange, ProviderDetailResponse, ProviderSnapshot } from "../types.js";
import { Badge } from "./Badge.js";
import { HistoryChart } from "./HistoryChart.js";
import { UsageLimitBar } from "./UsageLimitBar.js";

export interface ProviderDetailModalProps {
  providerId: string | null;
  onClose: () => void;
}

export const ProviderDetailModal: FC<ProviderDetailModalProps> = ({ providerId, onClose }) => {
  const [detail, setDetail] = useState<ProviderDetailResponse | null>(null);
  const [history, setHistory] = useState<ProviderSnapshot[]>([]);
  const [range, setRange] = useState<HistoryRange>("24h");
  const [loading, setLoading] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (providerId) {
      closeButtonRef.current?.focus();
    }
  }, [providerId]);

  // Fetch provider detail & history
  useEffect(() => {
    if (!providerId) return;

    let active = true;
    setLoading(true);

    Promise.all([
      fetch(`/api/providers/${providerId}`).then((r) => r.json()),
      fetch(`/api/history/${providerId}?range=${range}`).then((r) => r.json()),
    ])
      .then(([detailData, historyData]) => {
        if (!active) return;
        setDetail(detailData);
        setHistory(Array.isArray(historyData.history) ? historyData.history : []);
      })
      .catch((err) => {
        console.error("Failed to fetch provider detail:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId, range]);

  if (!providerId) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Provider details and history"
    >
      <div className="modal-content">
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="modal-title">{detail?.displayName ?? providerId}</h2>
            {detail?.snapshot && <Badge status={detail.snapshot.status} />}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {loading && !detail ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
            Loading details...
          </div>
        ) : (
          <>
            {/* Metadata Overview */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 12,
                backgroundColor: "var(--bg-card-inset)",
                padding: 14,
                borderRadius: 8,
                fontSize: "0.8rem",
              }}
            >
              <div>
                <div style={{ color: "var(--text-dim)" }}>CLI Version</div>
                <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                  {detail?.capability?.cli_version ?? "N/A"}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Auth State</div>
                <div style={{ fontWeight: 600 }}>{detail?.capability?.auth_state ?? "Unknown"}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Acquisition Source</div>
                <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                  {detail?.capability?.source ?? "None"}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Usage Surface</div>
                <div style={{ fontWeight: 600 }}>
                  {detail?.capability?.usage_capability ?? "Unknown"}
                </div>
              </div>
            </div>

            {/* Limits */}
            {detail?.snapshot?.limits && detail.snapshot.limits.length > 0 && (
              <div>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}>
                  Active Quotas & Limits
                </h3>
                <div className="limits-container">
                  {detail.snapshot.limits.map((l) => (
                    <UsageLimitBar key={l.id} limit={l} />
                  ))}
                </div>
              </div>
            )}

            {/* Diagnostic Message */}
            {detail?.capability?.reason && (
              <div className="unsupported-box">
                <span className="unsupported-title">Diagnostic Information</span>
                <p className="unsupported-desc">{detail.capability.reason}</p>
              </div>
            )}

            {/* History Chart */}
            <HistoryChart history={history} range={range} onRangeChange={setRange} />
          </>
        )}
      </div>
    </div>
  );
};
