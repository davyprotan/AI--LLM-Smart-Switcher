import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { percent } from "../../lib/format";
import { scanHardware } from "../../services/hardware";
import type { CommandResponse, HardwareScanPayload, WarningItem } from "../../types/domain";

export function HardwareScreen() {
  const [hardware, setHardware] = useState<CommandResponse<HardwareScanPayload> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    scanHardware()
      .then((result) => {
        if (active) {
          setHardware(result);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadFailed) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Hardware Detection"
          description="The hardware service failed to load, so the native system summary could not be shown."
        />
      </div>
    );
  }

  if (!hardware) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Hardware Detection"
          description="Loading the native hardware summary and compatibility baseline."
        />
      </div>
    );
  }

  const { profile: hardwareProfile, gauges: hardwareGauges, recommendations: recommendationTiers } = hardware.data;
  const warningItems: WarningItem[] = hardware.warnings.map((warning) => ({
    id: warning.code,
    title: warning.level === "warn" ? "Hardware warning" : warning.level === "error" ? "Hardware error" : "Hardware note",
    message: warning.message,
    tone: warning.level,
  }));

  return (
    <div className="screen-stack">
      <SectionHeader
        title="Hardware Detection"
        description={`Live system summary from ${hardware.meta.source === "native" ? "the native Tauri backend" : "mock preview mode"}.`}
      />

      {warningItems.map((warning) => (
        <WarningBanner key={warning.id} warning={warning} />
      ))}

      <div className="spec-grid">
        <Card>
          <span className="eyebrow">GPU</span>
          <h3>{hardwareProfile.gpu.name}</h3>
          <p>
            {hardwareProfile.gpu.vendor} ·{" "}
            {hardwareProfile.gpu.vramGb === null ? "VRAM pending" : `${hardwareProfile.gpu.vramGb} GB VRAM`}
          </p>
          <small>{hardwareProfile.gpu.driver}</small>
        </Card>

        <Card>
          <span className="eyebrow">CPU</span>
          <h3>{hardwareProfile.cpu.name}</h3>
          <p>
            {hardwareProfile.cpu.cores} cores · {hardwareProfile.cpu.threads} threads
          </p>
          <small>
            {hardwareProfile.cpu.architecture ?? "unknown architecture"}
            {hardwareProfile.cpu.frequencyGhz ? ` · ${hardwareProfile.cpu.frequencyGhz} GHz` : ""}
          </small>
        </Card>

        <Card>
          <span className="eyebrow">Memory</span>
          <h3>{hardwareProfile.memory.totalGb} GB</h3>
          <p>{hardwareProfile.memory.freeGb} GB currently free</p>
          <small>cross-platform scan planned</small>
        </Card>

        <Card>
          <span className="eyebrow">Disk</span>
          <h3>{hardwareProfile.disk.totalGb} GB</h3>
          <p>{hardwareProfile.disk.freeGb} GB free for model caches</p>
          <small>{hardwareProfile.os}</small>
        </Card>
      </div>

      <Card>
        <div className="card-header">
          <div>
            <span className="eyebrow">Compatibility Table</span>
            <h3>Resource budget</h3>
          </div>
        </div>

        <div className="stack-md">
          {hardwareGauges.map((gauge) => (
            <div key={gauge.id} className="gauge-row">
              <div className="gauge-labels">
                <span>{gauge.label}</span>
                <small>
                  {gauge.used}/{gauge.total} {gauge.unit}
                </small>
              </div>
              <ProgressBar value={percent(gauge.used, gauge.total)} />
            </div>
          ))}
        </div>
      </Card>

      <div className="three-column-grid">
        {recommendationTiers.map((tier) => (
          <Card key={tier.id}>
            <span className="eyebrow">{tier.label}</span>
            <h3>{tier.label} fit</h3>
            <p>{tier.rationale}</p>
            <ul className="plain-list">
              {tier.models.map((model) => (
                <li key={model}>{model}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
