import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { Card } from "../../components/ui/Card";
import { MetricTile } from "../../components/ui/MetricTile";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { useAppState } from "../../app/state";
import { safeInvoke } from "../../services/tauri";
import { percent } from "../../lib/format";
import type { HardwareGauge, TelemetryPayload } from "../../types/domain";

function telemetryToGauges(t: TelemetryPayload): HardwareGauge[] {
  const gpuAvailable = t.vramTotalGb != null && t.vramTotalGb > 0;
  return [
    {
      id: "gpu",
      label: "GPU VRAM",
      used: t.vramUsedGb ?? 0,
      total: t.vramTotalGb ?? 0,
      unit: "GB",
      detail: gpuAvailable ? "live" : "not detected",
    },
    { id: "ram", label: "System RAM", used: t.ramUsedGb, total: t.ramTotalGb, unit: "GB", detail: "live" },
    { id: "cpu", label: "CPU Load", used: t.cpuUsagePct, total: 100, unit: "%", detail: "live" },
    { id: "disk", label: "Disk Used", used: t.diskUsedGb, total: t.diskTotalGb, unit: "GB", detail: "live" },
  ];
}

export function DashboardScreen() {
  const { sessionMetrics, warnings, activityLog, variations, selectedVariationId } = useAppState();
  const [liveGauges, setLiveGauges] = useState<HardwareGauge[] | null>(null);
  const [telemetryActive, setTelemetryActive] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;

    (async () => {
      unlistenRef.current = await listen<TelemetryPayload>("hardware-telemetry", (event) => {
        if (active) setLiveGauges(telemetryToGauges(event.payload));
      });

      await safeInvoke("start_hardware_telemetry", { intervalMs: 3000 });
      if (active) setTelemetryActive(true);
    })();

    return () => {
      active = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
      safeInvoke("stop_hardware_telemetry");
    };
  }, []);

  return (
    <div className="screen-stack">
      <SectionHeader
        title="Command Center"
        description={
          telemetryActive
            ? "Live system telemetry · updates every 3 s."
            : "Connecting to native telemetry…"
        }
      />

      {warnings.length > 0 && (
        <div className="stack-sm">
          {warnings.map((warning) => (
            <WarningBanner key={warning.id} warning={warning} />
          ))}
        </div>
      )}

      <div className="metrics-grid">
        {sessionMetrics.map((metric) => (
          <MetricTile key={metric.id} label={metric.label} value={metric.value} detail={metric.detail} />
        ))}
      </div>

      <div className="two-column-grid">
        <Card>
          <div className="card-header">
            <div>
              <span className="eyebrow">Hardware Gauges</span>
              <h3>Current capacity snapshot</h3>
            </div>
            {telemetryActive && (
              <span className="live-badge">
                <span className="live-dot" />
                LIVE
              </span>
            )}
          </div>

          <div className="stack-md">
            {liveGauges ? (
              liveGauges.map((gauge) => (
                <div key={gauge.id} className="gauge-row">
                  <div className="gauge-labels">
                    <span>{gauge.label}</span>
                    <small>
                      {gauge.used}/{gauge.total} {gauge.unit} · {gauge.detail}
                    </small>
                  </div>
                  <ProgressBar value={percent(gauge.used, gauge.total)} />
                </div>
              ))
            ) : (
              <p>Waiting for the first telemetry tick…</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="card-header">
            <div>
              <span className="eyebrow">Variations</span>
              <h3>Compare shell directions</h3>
            </div>
          </div>

          <div className="stack-sm">
            {variations.map((variation) => (
              <article
                key={variation.id}
                className={variation.id === selectedVariationId ? "variation-card selected" : "variation-card"}
              >
                <strong>{variation.name}</strong>
                <p>{variation.description}</p>
              </article>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-header">
          <div>
            <span className="eyebrow">Activity Log</span>
            <h3>Recent system events</h3>
          </div>
        </div>

        {activityLog.length === 0 ? (
          <p>Activity logging will land here once provider switches and snapshot writes are wired through the event bus.</p>
        ) : (
          <div className="log-list">
            {activityLog.map((entry) => (
              <div key={entry.id} className="log-row">
                <span>{entry.timestamp}</span>
                <strong>{entry.level}</strong>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
