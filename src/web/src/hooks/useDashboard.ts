import { useCallback, useEffect, useRef, useState } from "react";
import type { AggregateSnapshot, ProviderSnapshot, SseConnectionStatus } from "../types.js";

export function useDashboard() {
  const [snapshot, setSnapshot] = useState<AggregateSnapshot | null>(null);
  const [refreshingProviders, setRefreshingProviders] = useState<Set<string>>(new Set());
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<SseConnectionStatus>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(60);

  // Load initial settings and cached snapshot
  const loadInitialData = useCallback(async () => {
    try {
      const [settingsRes, snapshotRes] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/snapshot?fresh=false").then((r) => r.json()),
      ]);

      if (settingsRes.settings) {
        setAutoRefreshEnabled(settingsRes.settings.auto_refresh_enabled ?? false);
        setRefreshIntervalSeconds(settingsRes.settings.refresh_interval_seconds ?? 60);
      }

      if (snapshotRes.providers) {
        setSnapshot(snapshotRes);
        setLastUpdated(new Date(snapshotRes.generated_at));
      }
    } catch (err) {
      console.error("Failed to load initial dashboard data:", err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // SSE connection
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isMounted = true;

    const connectSse = () => {
      if (!isMounted) return;
      setConnectionStatus("connecting");

      eventSource = new EventSource("/api/events");

      eventSource.addEventListener("connected", () => {
        if (!isMounted) return;
        setConnectionStatus("connected");
      });

      eventSource.addEventListener("provider:refreshing", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(e.data);
          if (data.provider_id) {
            setRefreshingProviders((prev) => new Set(prev).add(data.provider_id));
          }
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("provider:updated", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(e.data);
          const updated: ProviderSnapshot = data.snapshot;
          if (updated) {
            setSnapshot((prev) => {
              if (!prev) return prev;
              const nextProviders = prev.providers.map((p) => (p.id === updated.id ? updated : p));
              return { ...prev, providers: nextProviders };
            });
            setRefreshingProviders((prev) => {
              const next = new Set(prev);
              next.delete(updated.id);
              return next;
            });
            setLastUpdated(new Date());
          }
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener("snapshot:updated", (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(e.data);
          if (data.snapshot) {
            setSnapshot(data.snapshot);
            setRefreshingProviders(new Set());
            setIsRefreshingAll(false);
            setLastUpdated(new Date(data.snapshot.generated_at));
          }
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.onerror = () => {
        if (!isMounted) return;
        setConnectionStatus("offline");
        eventSource?.close();
        // Reconnect after delay
        setTimeout(() => {
          if (isMounted) connectSse();
        }, 3000);
      };
    };

    connectSse();

    return () => {
      isMounted = false;
      eventSource?.close();
    };
  }, []);

  // Refresh actions
  const refreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (data.snapshot) {
        setSnapshot(data.snapshot);
        setLastUpdated(new Date(data.snapshot.generated_at));
      }
    } catch (err) {
      console.error("Failed to refresh all:", err);
    } finally {
      setIsRefreshingAll(false);
      setRefreshingProviders(new Set());
    }
  }, []);

  const refreshProvider = useCallback(async (providerId: string) => {
    setRefreshingProviders((prev) => new Set(prev).add(providerId));
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, force: true }),
      });
      const data = await res.json();
      if (data.snapshot) {
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            providers: prev.providers.map((p) => (p.id === providerId ? data.snapshot : p)),
          };
        });
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error(`Failed to refresh provider ${providerId}:`, err);
    } finally {
      setRefreshingProviders((prev) => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  }, []);

  // Auto-refresh interval timer
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  useEffect(() => {
    if (!autoRefreshEnabled || refreshIntervalSeconds <= 0) return;

    const timer = setInterval(() => {
      refreshAllRef.current();
    }, refreshIntervalSeconds * 1000);

    return () => clearInterval(timer);
  }, [autoRefreshEnabled, refreshIntervalSeconds]);

  // Toggle auto refresh
  const toggleAutoRefresh = useCallback(async (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_refresh_enabled: enabled }),
      });
    } catch (err) {
      console.error("Failed to update auto refresh setting:", err);
    }
  }, []);

  // Change interval
  const changeInterval = useCallback(async (seconds: number) => {
    setRefreshIntervalSeconds(seconds);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_interval_seconds: seconds }),
      });
    } catch (err) {
      console.error("Failed to update interval setting:", err);
    }
  }, []);

  return {
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
    reloadSettings: loadInitialData,
  };
}
