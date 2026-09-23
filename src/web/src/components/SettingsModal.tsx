import { type FC, useEffect, useRef, useState } from "react";
import type { AppSettings, ProviderConfig } from "../types.js";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const SettingsModal: FC<SettingsModalProps> = ({ isOpen, onClose, onSettingsSaved }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && settings) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen, settings]);

  // Load current settings when opened
  useEffect(() => {
    if (!isOpen) return;

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setConfigs(data.provider_configs ?? []);
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
      });
  }, [isOpen]);

  if (!isOpen || !settings) return null;

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);

    try {
      // 1. Update app settings
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      // 2. Update each provider config
      await Promise.all(
        configs.map((c) =>
          fetch(`/api/settings/providers/${c.provider_id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              enabled: c.enabled,
              display_name_override: c.display_name_override || undefined,
              cooldown_seconds: c.cooldown_seconds,
            }),
          }),
        ),
      );

      setSavedSuccess(true);
      onSettingsSaved?.();
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

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
      aria-label="Application settings"
    >
      <div className="modal-content" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <h2 className="modal-title">Application Settings</h2>
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

        {/* Global Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Auto-Refresh</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Automatically query local CLIs on a periodic interval
              </div>
            </div>
            <label className="switch" aria-label="Toggle auto-refresh">
              <input
                type="checkbox"
                checked={settings.auto_refresh_enabled}
                onChange={(e) =>
                  setSettings({ ...settings, auto_refresh_enabled: e.target.checked })
                }
              />
              <span className="slider" />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Refresh Interval</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Default polling interval when auto-refresh is active
              </div>
            </div>
            <select
              className="select-input"
              aria-label="Refresh interval"
              value={settings.refresh_interval_seconds}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  refresh_interval_seconds: Number.parseInt(e.target.value, 10),
                })
              }
            >
              <option value="15">15 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds (Default)</option>
              <option value="300">5 minutes</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>History Retention</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Days to retain historical snapshots in local SQLite
              </div>
            </div>
            <select
              className="select-input"
              aria-label="History retention"
              value={settings.retention_days}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  retention_days: Number.parseInt(e.target.value, 10),
                })
              }
            >
              <option value="30">30 days</option>
              <option value="90">90 days (Default)</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
        </div>

        {/* Provider Settings */}
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "10px 0 12px" }}>
            Provider Configurations
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {configs.map((c, idx) => (
              <div
                key={c.provider_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "var(--bg-card-inset)",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    aria-label={`Enable ${c.provider_id}`}
                    checked={c.enabled}
                    onChange={(e) => {
                      const next = [...configs];
                      const target = next[idx];
                      if (target) {
                        next[idx] = { ...target, enabled: e.target.checked };
                        setConfigs(next);
                      }
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{c.provider_id}</div>
                    <input
                      type="text"
                      className="select-input"
                      placeholder="Label override (optional)"
                      value={c.display_name_override ?? ""}
                      onChange={(e) => {
                        const next = [...configs];
                        const target = next[idx];
                        if (target) {
                          next[idx] = {
                            ...target,
                            display_name_override: e.target.value || undefined,
                          };
                          setConfigs(next);
                        }
                      }}
                      style={{ marginTop: 4, width: 160, fontSize: "0.76rem" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}>
                  <span style={{ color: "var(--text-dim)" }}>Cooldown:</span>
                  <input
                    type="number"
                    min="0"
                    max="3600"
                    className="select-input"
                    style={{ width: 56, textAlign: "center" }}
                    value={c.cooldown_seconds}
                    onChange={(e) => {
                      const next = [...configs];
                      const target = next[idx];
                      if (target) {
                        next[idx] = {
                          ...target,
                          cooldown_seconds: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                        };
                        setConfigs(next);
                      }
                    }}
                  />
                  <span style={{ color: "var(--text-dim)" }}>s</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          {savedSuccess && (
            <span style={{ color: "var(--green)", fontSize: "0.84rem", alignSelf: "center" }}>
              ✓ Settings saved!
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};
