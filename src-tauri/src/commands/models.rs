use super::{CommandResponse, WarningLevel};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::time::Duration;
use tauri::Emitter;

const OLLAMA_TAGS_URL: &str = "http://localhost:11434/api/tags";
const OLLAMA_PULL_URL: &str = "http://localhost:11434/api/pull";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub family: String,
    pub context_window: String,
    pub install_size: String,
    pub vram_requirement_gb: Option<f64>,
    pub install_status: String,
    pub performance_hint: String,
    pub warning: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogPayload {
    pub ollama_available: bool,
    pub models: Vec<ModelEntry>,
}

// ── Ollama API types ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Deserialize)]
struct OllamaModel {
    name: String,
    size: u64,
    details: Option<OllamaModelDetails>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    family: Option<String>,
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

// ── Command ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_available_models() -> CommandResponse<ModelCatalogPayload> {
    let mut models: Vec<ModelEntry> = Vec::new();

    // Static API-hosted entries (always shown as "available")
    models.extend(static_api_models());

    // Ollama installed models via local HTTP API
    let ollama_result = fetch_ollama_models();
    let ollama_available = ollama_result.is_ok();
    let installed: Vec<ModelEntry> = ollama_result.unwrap_or_default();
    let installed_ids: std::collections::HashSet<String> =
        installed.iter().map(|m| m.id.clone()).collect();
    models.extend(installed);

    // Curated list of popular Ollama models the user can install with one click.
    // Filter out any that are already installed so we don't show duplicates.
    for entry in curated_ollama_models() {
        if !installed_ids.contains(&entry.id) {
            models.push(entry);
        }
    }

    let payload = ModelCatalogPayload {
        ollama_available,
        models,
    };

    let mut response = CommandResponse::native("models", payload);

    if !ollama_available {
        response = response.with_warning(
            "ollama-unavailable",
            WarningLevel::Info,
            "Ollama is not running or not installed — install actions will fail until you start `ollama serve`.",
        );
    }

    response
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPullProgress {
    pub model: String,
    pub status: String,
    pub total: Option<u64>,
    pub completed: Option<u64>,
    pub error: Option<String>,
    pub done: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPullResult {
    pub model: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Async wrapper that hops the blocking ureq pull onto Tauri's blocking
/// runtime so a long-running download (potentially > 1h on slow links) can't
/// monopolise a Tauri worker thread and starve other commands.
#[tauri::command]
pub async fn pull_ollama_model(
    app: tauri::AppHandle,
    model: String,
) -> CommandResponse<ModelPullResult> {
    let model_for_task = model.clone();
    let join = tauri::async_runtime::spawn_blocking(move || {
        pull_ollama_model_blocking(app, model_for_task)
    })
    .await;

    match join {
        Ok(result) => result,
        Err(e) => CommandResponse::native(
            "models",
            ModelPullResult {
                model,
                success: false,
                error: Some(format!("pull task failed to complete: {e}")),
            },
        ),
    }
}

fn pull_ollama_model_blocking(
    app: tauri::AppHandle,
    model: String,
) -> CommandResponse<ModelPullResult> {
    let body = serde_json::json!({ "model": model, "stream": true });

    // Pulls can take 10+ minutes on slow connections for big models.
    let response = match ureq::post(OLLAMA_PULL_URL)
        .timeout(Duration::from_secs(60 * 60))
        .send_json(body)
    {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("Could not reach Ollama at {OLLAMA_PULL_URL}: {e}");
            let _ = app.emit(
                "model-pull-progress",
                &ModelPullProgress {
                    model: model.clone(),
                    status: "error".to_string(),
                    total: None,
                    completed: None,
                    error: Some(err_msg.clone()),
                    done: true,
                },
            );
            return CommandResponse::native(
                "models",
                ModelPullResult {
                    model,
                    success: false,
                    error: Some(err_msg),
                },
            );
        }
    };

    let mut last_error: Option<String> = None;
    let mut saw_success = false;
    let reader = BufReader::new(response.into_reader());

    for line in reader.lines() {
        let line = match line {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };
        let json: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let status = json["status"].as_str().unwrap_or("").to_string();
        let total = json["total"].as_u64();
        let completed = json["completed"].as_u64();
        let error = json["error"].as_str().map(str::to_string);

        if let Some(ref e) = error {
            last_error = Some(e.clone());
        }
        if status == "success" {
            saw_success = true;
        }

        let _ = app.emit(
            "model-pull-progress",
            &ModelPullProgress {
                model: model.clone(),
                status: status.clone(),
                total,
                completed,
                error: error.clone(),
                done: saw_success || error.is_some(),
            },
        );

        if saw_success || error.is_some() {
            break;
        }
    }

    let success = saw_success && last_error.is_none();
    CommandResponse::native(
        "models",
        ModelPullResult {
            model,
            success,
            error: last_error,
        },
    )
}

// ── Ollama HTTP fetch ─────────────────────────────────────────────────────────

fn fetch_ollama_models() -> Result<Vec<ModelEntry>, String> {
    let response = ureq::get(OLLAMA_TAGS_URL)
        .timeout(Duration::from_secs(3))
        .call()
        .map_err(|e| e.to_string())?;

    let tags: OllamaTagsResponse = response.into_json().map_err(|e| e.to_string())?;

    let entries = tags
        .models
        .into_iter()
        .map(|m| ollama_model_to_entry(m))
        .collect();

    Ok(entries)
}

fn ollama_model_to_entry(m: OllamaModel) -> ModelEntry {
    let details = m.details.as_ref();
    let family = details
        .and_then(|d| d.family.as_deref())
        .unwrap_or("unknown")
        .to_string();
    let param_size = details
        .and_then(|d| d.parameter_size.as_deref())
        .unwrap_or("?")
        .to_string();
    let quant = details
        .and_then(|d| d.quantization_level.as_deref())
        .unwrap_or("GGUF")
        .to_string();

    let vram_gb = estimate_vram_gb(&param_size);
    let size_str = format_bytes(m.size);
    let model_name = m.name.clone();

    ModelEntry {
        id: format!("ollama/{}", m.name),
        name: model_name.clone(),
        provider: "ollama".to_string(),
        family: family.clone(),
        context_window: context_window_for_family(&family),
        install_size: size_str,
        vram_requirement_gb: vram_gb,
        install_status: "installed".to_string(),
        performance_hint: format!(
            "{} {quant} — runs locally via Ollama",
            param_size
        ),
        warning: if vram_gb.unwrap_or(0.0) > 20.0 {
            Some(format!(
                "Requires ~{:.0} GB VRAM — may need high-end GPU",
                vram_gb.unwrap_or(0.0)
            ))
        } else {
            None
        },
    }
}

// ── Static entries ────────────────────────────────────────────────────────────

fn static_api_models() -> Vec<ModelEntry> {
    vec![
        ModelEntry {
            id: "anthropic/claude-opus-4-7".to_string(),
            name: "Claude Opus 4.7".to_string(),
            provider: "anthropic".to_string(),
            family: "claude".to_string(),
            context_window: "200k tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "Frontier-class reasoning and code, highest capability".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "anthropic/claude-sonnet-4-6".to_string(),
            name: "Claude Sonnet 4.6".to_string(),
            provider: "anthropic".to_string(),
            family: "claude".to_string(),
            context_window: "200k tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "Balanced capability and speed, ideal for daily development".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "anthropic/claude-haiku-4-5".to_string(),
            name: "Claude Haiku 4.5".to_string(),
            provider: "anthropic".to_string(),
            family: "claude".to_string(),
            context_window: "200k tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "Fastest Claude — great for autocomplete and lightweight tasks".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "openai/gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            provider: "openai".to_string(),
            family: "gpt".to_string(),
            context_window: "128k tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "OpenAI flagship — strong vision and tool-use support".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "openai/gpt-4o-mini".to_string(),
            name: "GPT-4o mini".to_string(),
            provider: "openai".to_string(),
            family: "gpt".to_string(),
            context_window: "128k tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "Cost-efficient OpenAI model for high-volume workloads".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "google/gemini-2.0-flash".to_string(),
            name: "Gemini 2.0 Flash".to_string(),
            provider: "google".to_string(),
            family: "gemini".to_string(),
            context_window: "1M tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "Extremely long context, fast latency, strong multimodal support".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "google/gemini-1.5-pro".to_string(),
            name: "Gemini 1.5 Pro".to_string(),
            provider: "google".to_string(),
            family: "gemini".to_string(),
            context_window: "2M tokens".to_string(),
            install_size: "API".to_string(),
            vram_requirement_gb: None,
            install_status: "available".to_string(),
            performance_hint: "Largest context window available — ideal for entire-codebase tasks".to_string(),
            warning: None,
        },
    ]
}

fn curated_ollama_models() -> Vec<ModelEntry> {
    vec![
        ModelEntry {
            id: "ollama/qwen2.5-coder:7b".to_string(),
            name: "qwen2.5-coder:7b".to_string(),
            provider: "ollama".to_string(),
            family: "qwen".to_string(),
            context_window: "32k tokens".to_string(),
            install_size: "~4.7 GB".to_string(),
            vram_requirement_gb: Some(4.7),
            install_status: "available".to_string(),
            performance_hint: "Purpose-built coding model with strong autocomplete".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "ollama/llama3.1:8b".to_string(),
            name: "llama3.1:8b".to_string(),
            provider: "ollama".to_string(),
            family: "llama".to_string(),
            context_window: "128k tokens".to_string(),
            install_size: "~4.7 GB".to_string(),
            vram_requirement_gb: Some(4.8),
            install_status: "available".to_string(),
            performance_hint: "Strong general-purpose Meta model with long context".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "ollama/llama3.2:3b".to_string(),
            name: "llama3.2:3b".to_string(),
            provider: "ollama".to_string(),
            family: "llama".to_string(),
            context_window: "128k tokens".to_string(),
            install_size: "~2.0 GB".to_string(),
            vram_requirement_gb: Some(2.0),
            install_status: "available".to_string(),
            performance_hint: "Lightweight Meta model — good for quick tasks on small GPUs".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "ollama/mistral:7b".to_string(),
            name: "mistral:7b".to_string(),
            provider: "ollama".to_string(),
            family: "mistral".to_string(),
            context_window: "32k tokens".to_string(),
            install_size: "~4.1 GB".to_string(),
            vram_requirement_gb: Some(4.1),
            install_status: "available".to_string(),
            performance_hint: "Strong all-around local model with solid code quality".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "ollama/deepseek-coder:6.7b".to_string(),
            name: "deepseek-coder:6.7b".to_string(),
            provider: "ollama".to_string(),
            family: "deepseek".to_string(),
            context_window: "16k tokens".to_string(),
            install_size: "~3.8 GB".to_string(),
            vram_requirement_gb: Some(4.0),
            install_status: "available".to_string(),
            performance_hint: "Coding-specialised model, strong on autocomplete and refactors".to_string(),
            warning: None,
        },
        ModelEntry {
            id: "ollama/gemma3:4b".to_string(),
            name: "gemma3:4b".to_string(),
            provider: "ollama".to_string(),
            family: "gemma".to_string(),
            context_window: "128k tokens".to_string(),
            install_size: "~3.3 GB".to_string(),
            vram_requirement_gb: Some(3.4),
            install_status: "available".to_string(),
            performance_hint: "Latest Google open model, balanced quality and footprint".to_string(),
            warning: None,
        },
    ]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn estimate_vram_gb(param_size: &str) -> Option<f64> {
    let upper = param_size.to_uppercase();
    // Extract numeric prefix (e.g. "7B" → 7, "13B" → 13)
    let num_str: String = upper.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let num: f64 = num_str.parse().ok()?;

    // Approximate Q4_K_M VRAM: params (B) * 0.6 GB, round to 1 decimal
    let gb = if upper.ends_with('B') {
        num * 0.6
    } else if upper.ends_with('M') {
        num * 0.001 * 0.6
    } else {
        return None;
    };

    Some((gb * 10.0).round() / 10.0)
}

fn context_window_for_family(family: &str) -> String {
    match family.to_lowercase().as_str() {
        "llama" => "128k tokens".to_string(),
        "mistral" | "mixtral" => "32k tokens".to_string(),
        "qwen" | "qwen2" => "32k tokens".to_string(),
        "gemma" => "8k tokens".to_string(),
        _ => "Unknown".to_string(),
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{} B", bytes)
    }
}
