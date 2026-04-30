import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { runBenchmark } from "../../services/benchmark";
import type { BenchmarkResultEntry, BenchmarkSpec } from "../../types/domain";

const DEFAULT_PROMPT =
  "Draft a safe refactor plan for a provider switch, show the diff risk, and propose a one-command rollback.";

const OLLAMA_MODELS: BenchmarkSpec[] = [
  { provider: "ollama", model: "mistral:7b" },
  { provider: "ollama", model: "llama3.2:3b" },
  { provider: "ollama", model: "qwen2.5-coder:7b" },
];

export function BenchmarkScreen() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selected, setSelected] = useState<Set<string>>(new Set(["ollama/mistral:7b"]));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResultEntry[]>([]);
  const [done, setDone] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
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
    const models = OLLAMA_MODELS.filter((m) => selected.has(`${m.provider}/${m.model}`));
    if (models.length === 0) return;

    setRunning(true);
    setDone(false);
    setResults([]);

    if (isTauri()) {
      unlistenRef.current?.();
      unlistenRef.current = await listen<BenchmarkResultEntry>("benchmark-progress", (event) => {
        setResults((prev) => [...prev, event.payload]);
      });
    }

    await runBenchmark(prompt, models);

    unlistenRef.current?.();
    unlistenRef.current = null;
    setRunning(false);
    setDone(true);
  }

  const selectedModels = OLLAMA_MODELS.filter((m) => selected.has(`${m.provider}/${m.model}`));

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
            <p>Only models already pulled in Ollama will complete. Others return an error.</p>
            <div className="stack-sm" style={{ marginTop: 12 }}>
              {OLLAMA_MODELS.map((spec) => {
                const key = `${spec.provider}/${spec.model}`;
                const isSelected = selected.has(key);
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
                  </label>
                );
              })}
            </div>
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

          {results.length > 0 && (
            <div className="results-table">
              <div className="results-head">
                <span>Model</span>
                <span>Latency</span>
                <span>Throughput</span>
                <span>Tokens</span>
                <span>Status</span>
              </div>
              {results.map((result, i) => (
                <div key={i} className="results-row">
                  <span>{result.modelName}</span>
                  <span>{result.error ? "—" : `${result.latencyMs} ms`}</span>
                  <span>
                    {result.throughputTokensPerSec != null
                      ? `${result.throughputTokensPerSec} tok/s`
                      : "—"}
                  </span>
                  <span>{result.totalTokens ?? "—"}</span>
                  <span>
                    {result.error ? (
                      <StatusPill tone="error">error</StatusPill>
                    ) : (
                      <StatusPill tone="ok">ok</StatusPill>
                    )}
                  </span>
                </div>
              ))}
            </div>
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
        </Card>
      </div>
    </div>
  );
}
