use super::{CommandResponse, WarningLevel};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tauri::Emitter;

const OLLAMA_URL: &str = "http://localhost:11434/api/generate";

// Ollama can take 30s+ on a cold model load; allow plenty of headroom.
const OLLAMA_REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
const DEFAULT_PROMPT: &str =
    "Draft a safe refactor plan for a provider switch, show the diff risk, and propose a one-command rollback.";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkSpec {
    pub provider: String,
    pub model: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkResultEntry {
    pub provider: String,
    pub model_name: String,
    /// Total wall-clock time for the request — load + prompt eval + generation.
    pub latency_ms: u64,
    /// Time Ollama spent processing the input prompt before generating the
    /// first output token. Close enough to time-to-first-token to be useful.
    pub prompt_eval_ms: Option<u64>,
    pub throughput_tokens_per_sec: Option<f64>,
    pub total_tokens: Option<u32>,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRunPayload {
    pub prompt: String,
    pub results: Vec<BenchmarkResultEntry>,
}

#[tauri::command]
pub fn run_benchmark(
    app: tauri::AppHandle,
    prompt: Option<String>,
    models: Vec<BenchmarkSpec>,
) -> CommandResponse<BenchmarkRunPayload> {
    let prompt = prompt
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_PROMPT.to_string());

    let mut results = Vec::new();
    let mut ollama_attempted = false;

    for spec in &models {
        let result = match spec.provider.as_str() {
            "ollama" => {
                ollama_attempted = true;
                benchmark_ollama(&spec.model, &prompt)
            }
            provider => BenchmarkResultEntry {
                provider: provider.to_string(),
                model_name: spec.model.clone(),
                latency_ms: 0,
                prompt_eval_ms: None,
                throughput_tokens_per_sec: None,
                total_tokens: None,
                error: Some(format!(
                    "{provider} benchmarking requires an API key and is not supported yet. Only Ollama local models are currently benchmarkable."
                )),
            },
        };

        let _ = app.emit("benchmark-progress", &result);
        results.push(result);
    }

    let mut response = CommandResponse::native("benchmark", BenchmarkRunPayload { prompt, results });

    if models.is_empty() {
        response = response.with_warning(
            "no-models",
            WarningLevel::Warn,
            "No models were specified for the benchmark run.",
        );
    }

    if ollama_attempted {
        response = response.with_warning(
            "ollama-local-only",
            WarningLevel::Info,
            "Ollama benchmarks run against localhost:11434. Make sure Ollama is running and the model is pulled.",
        );
    }

    response
}

fn benchmark_ollama(model: &str, prompt: &str) -> BenchmarkResultEntry {
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false
    });

    let wall_start = Instant::now();

    let response = match ureq::post(OLLAMA_URL)
        .timeout(OLLAMA_REQUEST_TIMEOUT)
        .send_json(body)
    {
        Ok(r) => r,
        Err(ureq::Error::Status(code, response)) => {
            // Ollama responded with a non-2xx — surface its actual error body so
            // the user knows whether the model is missing, OOM, etc.
            let body = response
                .into_string()
                .unwrap_or_else(|_| "<unreadable response body>".to_string());
            let trimmed = body.trim();
            let detail = if trimmed.is_empty() {
                String::new()
            } else {
                format!(" — {trimmed}")
            };
            let hint = match code {
                404 => " (is the model pulled? `ollama pull <model>`)",
                500 => " (Ollama server error; check `ollama serve` logs)",
                _ => "",
            };
            return BenchmarkResultEntry {
                provider: "ollama".to_string(),
                model_name: model.to_string(),
                latency_ms: wall_start.elapsed().as_millis() as u64,
                prompt_eval_ms: None,
                throughput_tokens_per_sec: None,
                total_tokens: None,
                error: Some(format!("Ollama returned HTTP {code}{hint}{detail}")),
            };
        }
        Err(e) => {
            return BenchmarkResultEntry {
                provider: "ollama".to_string(),
                model_name: model.to_string(),
                latency_ms: wall_start.elapsed().as_millis() as u64,
                prompt_eval_ms: None,
                throughput_tokens_per_sec: None,
                total_tokens: None,
                error: Some(format!(
                    "Ollama unreachable at {OLLAMA_URL}: {e} (is `ollama serve` running?)"
                )),
            };
        }
    };

    let json: serde_json::Value = match response.into_json() {
        Ok(j) => j,
        Err(e) => {
            return BenchmarkResultEntry {
                provider: "ollama".to_string(),
                model_name: model.to_string(),
                latency_ms: wall_start.elapsed().as_millis() as u64,
                prompt_eval_ms: None,
                throughput_tokens_per_sec: None,
                total_tokens: None,
                error: Some(format!("Could not parse Ollama response: {e}")),
            };
        }
    };

    let eval_count = json["eval_count"].as_u64();
    let eval_duration_ns = json["eval_duration"].as_u64();
    let total_duration_ns = json["total_duration"].as_u64();
    let prompt_eval_duration_ns = json["prompt_eval_duration"].as_u64();

    let latency_ms = total_duration_ns
        .map(|ns| ns / 1_000_000)
        .unwrap_or_else(|| wall_start.elapsed().as_millis() as u64);

    let prompt_eval_ms = prompt_eval_duration_ns.map(|ns| ns / 1_000_000);

    let throughput = match (eval_count, eval_duration_ns) {
        (Some(tokens), Some(duration_ns)) if duration_ns > 0 => {
            let secs = duration_ns as f64 / 1_000_000_000.0;
            Some(((tokens as f64 / secs) * 10.0).round() / 10.0)
        }
        _ => None,
    };

    BenchmarkResultEntry {
        provider: "ollama".to_string(),
        model_name: model.to_string(),
        latency_ms,
        prompt_eval_ms,
        throughput_tokens_per_sec: throughput,
        total_tokens: eval_count.map(|c| c as u32),
        error: None,
    }
}
