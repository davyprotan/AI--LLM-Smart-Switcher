import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { buildMockBenchmarkResult, runBenchmark } from "../../services/benchmark";
import { listModels } from "../../services/models";
import { useAppState } from "../../app/state";
import { fitTier } from "../../lib/fit";
import type { BenchmarkResultEntry, BenchmarkRunRecord, BenchmarkSpec } from "../../types/domain";

const DEFAULT_PROMPT =
  "Draft a safe refactor plan for a provider switch, show the diff risk, and propose a one-command rollback.";

type Tier = { id: "fast" | "good" | "usable" | "slow"; label: string };

function throughputTier(tokensPerSec: number | null): Tier | null {
  if (tokensPerSec == null) return null;
  if (tokensPerSec >= 30) return { id: "fast", label: "Excellent — chat-fast" };
  if (tokensPerSec >= 15) return { id: "good", label: "Good — chat & autocomplete" };
  if (tokensPerSec >= 5) return { id: "usable", label: "Usable — background tasks" };
  return { id: "slow", label: "Slow — likely CPU-bound" };
}

interface ModelOption {
  spec: BenchmarkSpec;
  vramRequirementGb: number | null;
}

export function BenchmarkScreen() {
  const {
    hardwareScan,
    benchmarkHistory,
    refreshBenchmarkHistory,
    clearBenchmarkHistory: clearHistoryCached,
  } = useAppState();
  const vramAvailableGb = hardwareScan?.data.profile.gpu.vramGb ?? null;
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResultEntry[]>([]);
  const [done, setDone] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    listModels().then((response) => {
      if (!active) return;
      const installed = response.data.models
        .filter((m) => m.provider === "ollama" && m.installStatus === "installed")
        .map<ModelOption>((m) => ({
          spec: { provider: "ollama", model: m.name },
          vramRequirementGb: m.vramRequirementGb,
        }));
      setAvailableModels(installed);
      setOllamaAvailable(response.data.ollamaAvailable);
      // pre-select the first installed model so the user can run with one click
      const first = installed[0];
      if (first) {
        setSelected(new Set([`${first.spec.provider}/${first.spec.model}`]));
      }
      setModelsLoaded(true);
    });
    return () => {
      active = false;
      unlistenRef.current?.();
    };
  }, []);

  function toggleModel(spec: BenchmarkSpec) {
    const key = `${spec.provider}/${spec.model}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleRun() {
    const specs = availableModels
      .filter((m) => selected.has(`${m.spec.provider}/${m.spec.model}`))
      .map((m) => m.spec);
    if (specs.length === 0) return;

    setRunning(true);
    setDone(false);
    setResults([]);

    if (!isTauri()) {
      // Browser preview: emit mock results so the user sees a clear "preview mode" message
      setResults(specs.map(buildMockBenchmarkResult));
      setRunning(false);
      setDone(true);
      return;
    }

    // Drop any listener left over from a previous run before subscribing
    // again, so we don't end up with two callbacks pushing into `results`.
    unlistenRef.current?.();
    unlistenRef.current = null;
    const unlisten = await listen<BenchmarkResultEntry>("benchmark-progress", (event) => {
      setResults((prev) => [...prev, event.payload]);
    });
    unlistenRef.current = unlisten;

    await runBenchmark(prompt, specs);

    unlistenRef.current?.();
    unlistenRef.current = null;
    setRunning(false);
    setDone(true);
    // The backend just persisted this run; refresh the cache so it shows up
    // immediately in the history card without a page refresh.
    void refreshBenchmarkHistory();
  }

  const selectedModels = availableModels.filter((m) =>
    selected.has(`${m.spec.provider}/${m.spec.model}`),
  );

  return (
    <div className="screen-stack">
      <SectionHeader
        title="Benchmark Runner"
        description="Run a shared prompt across local Ollama models and compare latency and throughput."
        action={
          <Button variant="primary" onClick={handleRun} disabled={running || selectedModels.length === 0}>
            {running ? `Running… (${results.length}/${selectedModels.length})` : "Run benchmark"}
          </Button>
        }
      />

      <div className="two-column-grid">
        <div className="stack-md">
          <Card>
            <span className="eyebrow">Test Prompt</span>
            <h3>Prompt</h3>
            <textarea
              className="benchmark-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={running}
            />
          </Card>

          <Card>
            <span className="eyebrow">Ollama Models</span>
            <h3>Select models to benchmark</h3>
            {!modelsLoaded && <p>Loading installed models…</p>}
            {modelsLoaded && !ollamaAvailable && (
              <p>Ollama is not running on localhost:11434. Start Ollama and reopen this screen.</p>
            )}
            {modelsLoaded && ollamaAvailable && availableModels.length === 0 && (
              <p>No Ollama models installed. Pull one first, e.g. <code>ollama pull qwen2.5-coder:7b</code>.</p>
            )}
            {modelsLoaded && availableModels.length > 0 && (
              <>
                <p>Showing models currently installed in your local Ollama.</p>
                <div className="stack-sm" style={{ marginTop: 12 }}>
                  {availableModels.map((option) => {
                    const { spec, vramRequirementGb } = option;
                    const key = `${spec.provider}/${spec.model}`;
                    const isSelected = selected.has(key);
                    const fit = fitTier(vramRequirementGb, vramAvailableGb);
                    return (
                      <label key={key} className="model-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleModel(spec)}
                          disabled={running}
                        />
                        <span>{spec.model}</span>
                        <small>{spec.provider}</small>
                        {fit && (
                          <span className={`fit-pill fit-${fit.id}`} title={fit.label}>
                            {fit.short}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>

        <Card>
          <div className="card-header">
            <div>
              <span className="eyebrow">Results</span>
              <h3>Comparison</h3>
            </div>
            {running && <StatusPill tone="info">running</StatusPill>}
            {done && !running && results.length > 0 && <StatusPill tone="ok">complete</StatusPill>}
          </div>

          {results.length === 0 && !running && (
            <p>Select models and run to see latency and throughput results.</p>
          )}

          {results.length > 0 && <ResultsTable results={results} showFootnote />}

          {results.some((r) => r.error) && (
            <div className="stack-sm" style={{ marginTop: 16 }}>
              {results
                .filter((r) => r.error)
                .map((r, i) => (
                  <small key={i} style={{ color: "var(--danger)" }}>
                    {r.modelName}: {r.error}
                  </small>
                ))}
            </div>
          )}
        </Card>
      </div>

      <HistoryCard
        history={benchmarkHistory}
        onClear={() => clearHistoryCached()}
      />
    </div>
  );
}

function ResultsTable({
  results,
  showFootnote = false,
}: {
  results: BenchmarkResultEntry[];
  showFootnote?: boolean;
}) {
  return (
    <>
      <div className="results-table">
        <div className="results-head">
          <span>Model</span>
          <span title="Time to first token (Ollama prompt eval)">First token</span>
          <span
            title={
              "tok/s tiers — >30 fast, 15–30 good, 5–15 usable, <5 slow.\n" +
              "Heuristic only: real-world fit depends on context length, quantization and workload."
            }
          >
            Throughput
          </span>
          <span title="Total wall-clock time for the request">Total</span>
          <span>Tokens</span>
          <span>Verdict</span>
        </div>
        {results.map((result, i) => {
          const tier = throughputTier(result.throughputTokensPerSec);
          return (
            <div key={i} className="results-row">
              <span>{result.modelName}</span>
              <span>
                {result.error || result.promptEvalMs == null ? "—" : `${result.promptEvalMs} ms`}
              </span>
              <span className={tier ? `tput-${tier.id}` : undefined}>
                {result.throughputTokensPerSec != null
                  ? `${result.throughputTokensPerSec} tok/s`
                  : "—"}
              </span>
              <span>{result.error ? "—" : `${result.latencyMs} ms`}</span>
              <span>{result.totalTokens ?? "—"}</span>
              <span>
                {result.error ? (
                  <StatusPill tone="error">error</StatusPill>
                ) : tier ? (
                  <small className={`tput-${tier.id}`}>{tier.label}</small>
                ) : (
                  <small>—</small>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {showFootnote && (
        <small className="results-footnote">
          Tiers are rough heuristics on Ollama eval rate alone. Real fit also depends on
          context length, quantization, KV cache and concurrent load.
        </small>
      )}
      {results.some((r) => r.error) && (
        <div className="stack-sm" style={{ marginTop: 16 }}>
          {results
            .filter((r) => r.error)
            .map((r, i) => (
              <small key={i} style={{ color: "var(--danger)" }}>
                {r.modelName}: {r.error}
              </small>
            ))}
        </div>
      )}
    </>
  );
}

function HistoryCard({
  history,
  onClear,
}: {
  history: BenchmarkRunRecord[];
  onClear: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <Card>
        <div className="card-header">
          <div>
            <span className="eyebrow">Run History</span>
            <h3>No saved runs yet</h3>
          </div>
        </div>
        <p>Each benchmark you run is saved here so you can compare numbers across sessions, models or driver updates. The last 20 runs are kept on disk.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="card-header">
        <div>
          <span className="eyebrow">Run History</span>
          <h3>{history.length} saved run{history.length !== 1 ? "s" : ""}</h3>
        </div>
        <Button variant="danger" onClick={onClear}>
          Clear history
        </Button>
      </div>
      <div className="history-rows">
        {history.map((run) => (
          <HistoryRow
            key={run.id}
            run={run}
            isOpen={openId === run.id}
            onToggle={() => setOpenId(openId === run.id ? null : run.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function HistoryRow({
  run,
  isOpen,
  onToggle,
}: {
  run: BenchmarkRunRecord;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const successful = run.results.filter((r) => !r.error);
  const bestTput = successful.reduce<number | null>((best, r) => {
    if (r.throughputTokensPerSec == null) return best;
    if (best == null || r.throughputTokensPerSec > best) return r.throughputTokensPerSec;
    return best;
  }, null);
  const errorCount = run.results.length - successful.length;
  return (
    <div className="history-row">
      <button type="button" className="history-row-head" onClick={onToggle}>
        <span className="history-when">{formatRelative(run.startedAtEpochMs)}</span>
        <span className="history-summary">
          {run.results.length} model{run.results.length !== 1 ? "s" : ""}
          {bestTput != null && ` · best ${bestTput} tok/s`}
          {errorCount > 0 && ` · ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
        </span>
        <span className="history-toggle">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && (
        <div className="history-row-body">
          <small className="history-prompt">Prompt: {truncate(run.prompt, 140)}</small>
          <ResultsTable results={run.results} />
        </div>
      )}
    </div>
  );
}

function formatRelative(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  if (diffMs < 0) return new Date(epochMs).toLocaleString();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
