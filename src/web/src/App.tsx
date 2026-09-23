import { type FC, useState } from "react";
import { Header } from "./components/Header.js";
import { ProviderCard } from "./components/ProviderCard.js";
import { ProviderDetailModal } from "./components/ProviderDetailModal.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { useDashboard } from "./hooks/useDashboard.js";

// Priority order defined in canonical requirements Section 1
const PRIORITY_ORDER = ["kimi", "codex", "cursor", "opencode", "antigravity"];

export const App: FC = () => {
  const {
    snapshot,
    refreshingProviders,
    isRefreshingAll,
    connectionStatus,
    lastUpdated,
    autoRefreshEnabled,
    refreshIntervalSeconds,
    refreshAll,
    refreshProvider,
    toggleAutoRefresh,
    changeInterval,
    reloadSettings,
  } = useDashboard();

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const providers = snapshot?.providers ?? [];

  // Sort providers according to priority order
  const sortedProviders = [...providers].sort((a, b) => {
    const idxA = PRIORITY_ORDER.indexOf(a.id);
    const idxB = PRIORITY_ORDER.indexOf(b.id);
    const orderA = idxA === -1 ? 999 : idxA;
    const orderB = idxB === -1 ? 999 : idxB;
    return orderA - orderB;
  });

  const staleProviders = providers.filter((p) => p.stale);

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Header
        lastUpdated={lastUpdated}
        connectionStatus={connectionStatus}
        autoRefreshEnabled={autoRefreshEnabled}
        refreshIntervalSeconds={refreshIntervalSeconds}
        isRefreshingAll={isRefreshingAll}
        onToggleAutoRefresh={toggleAutoRefresh}
        onChangeInterval={changeInterval}
        onRefreshAll={refreshAll}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Stale Data Warning Banner */}
      {staleProviders.length > 0 && (
        <div className="stale-banner" role="alert">
          <div>
            <strong>Notice:</strong> One or more providers failed their most recent refresh.
            Displaying preserved last-known good usage data.
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={refreshAll}
            disabled={isRefreshingAll}
          >
            Retry Refresh
          </button>
        </div>
      )}

      {/* Main Grid */}
      <main id="main-content" tabIndex={-1}>
        {providers.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}
          >
            <p style={{ fontSize: "1rem", marginBottom: 12 }}>Loading subscription limits...</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={refreshAll}
              disabled={isRefreshingAll}
            >
              Refresh Limits
            </button>
          </div>
        ) : (
          <section className="cards-grid" aria-label="AI coding subscription limit cards">
            {sortedProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                snapshot={provider}
                isRefreshing={refreshingProviders.has(provider.id) || isRefreshingAll}
                onRefresh={refreshProvider}
                onViewDetails={setSelectedProviderId}
              />
            ))}
          </section>
        )}
      </main>

      {/* Provider Details & History Modal */}
      <ProviderDetailModal
        providerId={selectedProviderId}
        onClose={() => setSelectedProviderId(null)}
      />

      {/* Application Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={reloadSettings}
      />
    </div>
  );
};
