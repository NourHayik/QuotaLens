import type { FC } from "react";
import type { HistoryRange, ProviderSnapshot } from "../types.js";

export interface HistoryChartProps {
  history: ProviderSnapshot[];
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
}

export const HistoryChart: FC<HistoryChartProps> = ({ history, range, onRangeChange }) => {
  // Extract data points (chronological order: oldest to newest)
  const sorted = [...history].sort(
    (a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime(),
  );

  const points = sorted
    .map((s) => {
      const primaryLimit = s.limits[0];
      const used = primaryLimit?.used_percent ?? 0;
      return {
        time: new Date(s.fetched_at),
        used,
      };
    })
    .filter((p) => !Number.isNaN(p.used));

  const hasData = points.length > 0;

  // Chart dimensions
  const width = 580;
  const height = 140;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 24;

  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  // SVG polyline points
  let polylinePoints = "";
  if (hasData && points.length > 1) {
    polylinePoints = points
      .map((p, idx) => {
        const x = padLeft + (idx / (points.length - 1)) * chartWidth;
        const y = padTop + chartHeight - (p.used / 100) * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>Usage History</span>
        <div className="range-buttons">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-sm ${range === r ? "btn-primary" : "btn-secondary"}`}
              onClick={() => onRangeChange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div
          style={{
            textAlign: "center",
            padding: "30px 0",
            color: "var(--text-dim)",
            fontSize: "0.82rem",
          }}
        >
          No historical usage snapshots recorded for this period yet.
        </div>
      ) : points.length === 1 ? (
        <div
          style={{
            textAlign: "center",
            padding: "24px 0",
            color: "var(--text-muted)",
            fontSize: "0.84rem",
          }}
        >
          1 data point: {points[0]?.used}% used at {points[0]?.time.toLocaleTimeString()}
        </div>
      ) : (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Usage trend chart over ${range}`}
        >
          {/* Y-axis grid lines */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={width - padRight}
            y2={padTop}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 6}
            y={padTop + 4}
            fill="var(--text-dim)"
            fontSize="10"
            textAnchor="end"
          >
            100%
          </text>

          <line
            x1={padLeft}
            y1={padTop + chartHeight / 2}
            x2={width - padRight}
            y2={padTop + chartHeight / 2}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <text
            x={padLeft - 6}
            y={padTop + chartHeight / 2 + 4}
            fill="var(--text-dim)"
            fontSize="10"
            textAnchor="end"
          >
            50%
          </text>

          <line
            x1={padLeft}
            y1={padTop + chartHeight}
            x2={width - padRight}
            y2={padTop + chartHeight}
            stroke="var(--border)"
          />
          <text
            x={padLeft - 6}
            y={padTop + chartHeight + 4}
            fill="var(--text-dim)"
            fontSize="10"
            textAnchor="end"
          >
            0%
          </text>

          {/* Trend line */}
          <polyline
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />

          {/* Dots on data points */}
          {points.map((p, idx) => {
            const x = padLeft + (idx / (points.length - 1)) * chartWidth;
            const y = padTop + chartHeight - (p.used / 100) * chartHeight;
            return (
              <circle
                key={`pt-${p.time.getTime()}`}
                cx={x}
                cy={y}
                r="3.5"
                fill="var(--accent)"
                stroke="var(--bg-card)"
                strokeWidth="1.5"
              >
                <title>{`${p.used}% at ${p.time.toLocaleString()}`}</title>
              </circle>
            );
          })}
        </svg>
      )}
    </div>
  );
};
