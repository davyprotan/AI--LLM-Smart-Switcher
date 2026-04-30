import { safeInvoke } from "./tauri";
import type { BenchmarkResultEntry, BenchmarkRunPayload, BenchmarkSpec, CommandResponse } from "../types/domain";

export async function runBenchmark(
  prompt: string,
  models: BenchmarkSpec[],
): Promise<CommandResponse<BenchmarkRunPayload> | null> {
  return safeInvoke<CommandResponse<BenchmarkRunPayload>>("run_benchmark", { prompt, models });
}

export function buildMockBenchmarkResult(spec: BenchmarkSpec): BenchmarkResultEntry {
  return {
    provider: spec.provider,
    modelName: spec.model,
    latencyMs: 0,
    throughputTokensPerSec: null,
    totalTokens: null,
    error: "Preview mode — Tauri not active. Run in the desktop app to benchmark real models.",
  };
}
