import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { listModels, pullOllamaModel } from "../../services/models";
import { useAppState } from "../../app/state";
import { fitTier, fitRank, type FitTier } from "../../lib/fit";
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
  const { hardwareScan } = useAppState();
  const vramAvailableGb = hardwareScan?.data.profile.gpu.vramGb ?? null;
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
        try {
          const unlisten = await listen<ModelPullProgress>("model-pull-progress", (event) => {
            const { model, status, total, completed, error, done } = event.payload;
            setPulls((prev) => ({
              ...prev,
              [model]: { status, total, completed, error, done },
            }));
          });
          // If we unmounted while waiting for `listen` to resolve, drop the
          // listener immediately rather than leaking it.
          if (active) {
            unlistenRef.current = unlisten;
          } else {
            unlisten();
          }
        } catch {
          /* If listen() rejects (rare), there's nothing to clean up. */
        }
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

  // useMemo must run unconditionally to satisfy the rules of Hooks; gate the
  // sort body on `state` instead of returning early before it.
  const sortedModels = useMemo(
    () => (state ? sortModelsByFit(state.data.models, vramAvailableGb) : []),
    [state, vramAvailableGb],
  );

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
        {sortedModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            ollamaAvailable={ollamaAvailable}
            pull={pulls[model.name]}
            onPull={() => handlePull(model.name)}
            fit={fitTier(model.vramRequirementGb, vramAvailableGb)}
          />
        ))}
      </div>
    </div>
  );
}

function sortModelsByFit(models: ModelCatalogItem[], vramGb: number | null): ModelCatalogItem[] {
  const isOllama = (m: ModelCatalogItem) => m.provider === "ollama";
  return [...models].sort((a, b) => {
    // Ollama first (locally runnable), then everything else
    if (isOllama(a) !== isOllama(b)) return isOllama(a) ? -1 : 1;
    if (isOllama(a)) {
      // Installed always before available
      if (a.installStatus !== b.installStatus) {
        if (a.installStatus === "installed") return -1;
        if (b.installStatus === "installed") return 1;
      }
      const aRank = fitRank(fitTier(a.vramRequirementGb, vramGb));
      const bRank = fitRank(fitTier(b.vramRequirementGb, vramGb));
      if (aRank !== bRank) return aRank - bRank;
    }
    return a.name.localeCompare(b.name);
  });
}

function ModelCard({
  model,
  ollamaAvailable,
  pull,
  onPull,
  fit,
}: {
  model: ModelCatalogItem;
  ollamaAvailable: boolean;
  pull: PullState | undefined;
  onPull: () => void;
  fit: FitTier | null;
}) {
  const statusTone =
    model.installStatus === "installed" ? "ok" : model.installStatus === "warning" ? "warn" : "idle";

  const isOllama = model.provider === "ollama";
  const isCloud = model.vramRequirementGb == null;
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
        <div className="card-pill-stack">
          <StatusPill tone={statusTone}>{model.installStatus}</StatusPill>
          {isOllama && fit && (
            <span className={`fit-pill fit-${fit.id}`} title={fit.label}>
              {fit.short}
            </span>
          )}
          {isCloud && (
            <span className="cloud-pill" title="Hosted by the provider — runs in the cloud, not on your GPU.">
              Cloud
            </span>
          )}
        </div>
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
          <strong>{model.vramRequirementGb ? `${model.vramRequirementGb} GB` : "n/a"}</strong>
        </div>
      </div>

      <p>{model.performanceHint}</p>
      {isCloud && (
        <small className="text-muted">Runs on the provider's API · API key required (Settings).</small>
      )}
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
