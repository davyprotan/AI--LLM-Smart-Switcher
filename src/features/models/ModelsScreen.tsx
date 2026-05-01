import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { listModels, pullOllamaModel } from "../../services/models";
import type {
  CommandResponse,
  ModelCatalogItem,
  ModelCatalogPayload,
  ModelPullProgress,
  WarningItem,
} from "../../types/domain";

interface PullState {
  status: string;
  total: number | null;
  completed: number | null;
  error: string | null;
  done: boolean;
}

export function ModelsScreen() {
  const [state, setState] = useState<CommandResponse<ModelCatalogPayload> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const unlistenRef = useRef<(() => void) | null>(null);

  function refresh() {
    listModels()
      .then((result) => {
        setState(result);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }

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

    if (isTauri()) {
      (async () => {
        unlistenRef.current = await listen<ModelPullProgress>("model-pull-progress", (event) => {
          const { model, status, total, completed, error, done } = event.payload;
          setPulls((prev) => ({
            ...prev,
            [model]: { status, total, completed, error, done },
          }));
        });
      })();
    }

    return () => {
      active = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, []);

  async function handlePull(modelName: string) {
    setPulls((prev) => ({
      ...prev,
      [modelName]: { status: "starting", total: null, completed: null, error: null, done: false },
    }));
    const result = await pullOllamaModel(modelName);
    if (result?.data.success) {
      // Re-fetch so the card flips from "available" → "installed".
      refresh();
    } else if (result?.data.error) {
      setPulls((prev) => ({
        ...prev,
        [modelName]: {
          status: "error",
          total: null,
          completed: null,
          error: result.data.error,
          done: true,
        },
      }));
    }
  }

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
    ? `${installedCount} Ollama model${installedCount !== 1 ? "s" : ""} installed · install more from the curated list below.`
    : "Ollama not running — install actions will fail until you start Ollama.";

  return (
    <div className="screen-stack">
      <SectionHeader title="Model Library" description={description} />

      {warningItems.map((w) => (
        <WarningBanner key={w.id} warning={w} />
      ))}

      <div className="catalog-grid">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            ollamaAvailable={ollamaAvailable}
            pull={pulls[model.name]}
            onPull={() => handlePull(model.name)}
          />
        ))}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  ollamaAvailable,
  pull,
  onPull,
}: {
  model: ModelCatalogItem;
  ollamaAvailable: boolean;
  pull: PullState | undefined;
  onPull: () => void;
}) {
  const statusTone =
    model.installStatus === "installed" ? "ok" : model.installStatus === "warning" ? "warn" : "idle";

  const isOllama = model.provider === "ollama";
  const canInstall = isOllama && model.installStatus === "available" && ollamaAvailable;
  const pulling = pull && !pull.done;
  const pullPercent =
    pull?.total && pull.completed != null && pull.total > 0
      ? Math.min(100, Math.round((pull.completed / pull.total) * 100))
      : null;

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

      {canInstall && (
        <div className="model-install">
          {pulling ? (
            <>
              <small>{pull?.status ?? "starting"}…{pullPercent !== null ? ` ${pullPercent}%` : ""}</small>
              <ProgressBar value={pullPercent ?? 0} />
            </>
          ) : pull?.error ? (
            <>
              <small className="text-warning">{pull.error}</small>
              <Button variant="primary" onClick={onPull}>
                Retry install
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onPull}>
              Install via Ollama
            </Button>
          )}
        </div>
      )}

      {isOllama && model.installStatus === "available" && !ollamaAvailable && (
        <small className="text-warning">Start Ollama to install this model.</small>
      )}
    </Card>
  );
}
