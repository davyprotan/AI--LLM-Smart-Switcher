import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { listModels } from "../../services/models";
import type { CommandResponse, ModelCatalogItem, ModelCatalogPayload, WarningItem } from "../../types/domain";

export function ModelsScreen() {
  const [state, setState] = useState<CommandResponse<ModelCatalogPayload> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    listModels()
      .then((result) => {
        if (active) {
          setState(result);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadFailed) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Model Library"
          description="Model catalog failed to load."
        />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Model Library"
          description="Loading model catalog…"
        />
      </div>
    );
  }

  const warningItems: WarningItem[] = state.warnings.map((w) => ({
    id: w.code,
    title: w.level === "warn" ? "Warning" : w.level === "error" ? "Error" : "Note",
    message: w.message,
    tone: w.level,
  }));

  const { ollamaAvailable, models } = state.data;

  const installedCount = models.filter((m) => m.installStatus === "installed").length;
  const description = ollamaAvailable
    ? `${installedCount} Ollama model${installedCount !== 1 ? "s" : ""} installed · API providers always available.`
    : "Ollama not running — showing API providers and placeholder local models.";

  return (
    <div className="screen-stack">
      <SectionHeader title="Model Library" description={description} />

      {warningItems.map((w) => (
        <WarningBanner key={w.id} warning={w} />
      ))}

      <div className="catalog-grid">
        {models.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </div>
    </div>
  );
}

function ModelCard({ model }: { model: ModelCatalogItem }) {
  const statusTone =
    model.installStatus === "installed" ? "ok" : model.installStatus === "warning" ? "warn" : "idle";

  return (
    <Card>
      <div className="card-header">
        <div>
          <span className="eyebrow">{model.provider}</span>
          <h3>{model.name}</h3>
        </div>
        <StatusPill tone={statusTone}>{model.installStatus}</StatusPill>
      </div>

      <div className="meta-grid">
        <div>
          <small>Family</small>
          <strong>{model.family}</strong>
        </div>
        <div>
          <small>Context</small>
          <strong>{model.contextWindow}</strong>
        </div>
        <div>
          <small>Size</small>
          <strong>{model.installSize}</strong>
        </div>
        <div>
          <small>VRAM</small>
          <strong>{model.vramRequirementGb ? `${model.vramRequirementGb} GB` : "API"}</strong>
        </div>
      </div>

      <p>{model.performanceHint}</p>
      {model.warning ? <small className="text-warning">{model.warning}</small> : null}
    </Card>
  );
}
