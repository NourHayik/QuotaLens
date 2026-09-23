import type { FC } from "react";
import type { SseConnectionStatus } from "../types.js";

export interface HeaderProps {
  lastUpdated: Date | null;
  connectionStatus: SseConnectionStatus;
  autoRefreshEnabled: boolean;
  refreshIntervalSeconds: number;
  isRefreshingAll: boolean;
  onToggleAutoRefresh: (enabled: boolean) => void;
  onChangeInterval: (seconds: number) => void;
  onRefreshAll: () => void;
  onOpenSettings: () => void;
}

export const Header: FC<HeaderProps> = ({
  lastUpdated,
  connectionStatus,
  autoRefreshEnabled,
  refreshIntervalSeconds,
  isRefreshingAll,
  onToggleAutoRefresh,
  onChangeInterval,
  onRefreshAll,
  onOpenSettings,
}) => {
  const timeString = lastUpdated?.toLocaleTimeString() ?? "Never";

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-title">
          <span>AI Limits Dashboard</span>
          <span className="brand-badge">Loopback</span>
        </div>
        <span className="brand-subtitle">Local AI coding subscription limits & quota tracker</span>
      </div>

      <div className="header-controls">
        {/* SSE status */}
        <div className="status-indicator" aria-live="polite">
          <span className={`dot dot-${connectionStatus}`} />
          <span>
            {connectionStatus === "connected"
              ? "Live"
              : connectionStatus === "connecting"
                ? "Connecting..."
                : "Offline"}
          </span>
        </div>

        {/* Last updated */}
        {lastUpdated ? (
          <p className="last-updated">
            Last updated <time dateTime={lastUpdated.toISOString()}>{timeString}</time>
          </p>
        ) : (
          <p className="last-updated">Last updated never</p>
        )}

        {/* Auto refresh switch */}
        <div className="control-group">
          <label className="switch" aria-label="Toggle auto-refresh">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(e) => onToggleAutoRefresh(e.target.checked)}
            />
            <span className="slider" />
          </label>
          <span className="control-label">Auto-Refresh</span>
        </div>

        {/* Interval dropdown */}
        <select
          className="select-input"
          aria-label="Select refresh interval"
          value={refreshIntervalSeconds}
          onChange={(e) => onChangeInterval(Number.parseInt(e.target.value, 10))}
        >
          <option value="15">15s</option>
          <option value="30">30s</option>
          <option value="60">60s</option>
          <option value="300">5m</option>
        </select>

        {/* Refresh All button */}
        <button
          type="button"
          className="btn btn-primary"
          disabled={isRefreshingAll}
          onClick={onRefreshAll}
          aria-label="Refresh all providers"
        >
          <span className={isRefreshingAll ? "spin" : ""}>↻</span>
          {isRefreshingAll ? "Refreshing..." : "Refresh All"}
        </button>

        {/* Settings button */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          ⚙ Settings
        </button>
      </div>
    </header>
  );
};
