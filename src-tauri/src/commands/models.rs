use super::{CommandResponse, WarningLevel};
use serde::{Deserialize, Serialize};

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

    match ollama_result {
        Ok(ollama_models) => models.extend(ollama_models),
        Err(_) => {
            // Add placeholder entries for popular Ollama models so the UI stays useful
            models.extend(placeholder_ollama_models());
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
            "Ollama is not running or not installed — local model list shows placeholder entries. Start Ollama to see installed models.",
        );
    }

    response
}

#[tauri::command]
pub fn install_model_stub(_model_id: String) -> CommandResponse<&'static str> {
    CommandResponse::native(
        "models",
        "Install orchestration for Ollama, llama.cpp, and hosted providers is still pending.",
    )
}

// ── Ollama HTTP fetch ─────────────────────────────────────────────────────────

fn fetch_ollama_models() -> Result<Vec<ModelEntry>, String> {
    let response = ureq::get("http://localhost:11434/api/tags")
        .timeout(std::time::Duration::from_secs(3))
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

fn placeholder_ollama_models() -> Vec<ModelEntry> {
    vec![
        ModelEntry {
            id: "ollama/mistral:7b".to_string(),
            name: "mistral:7b".to_string(),
            provider: "ollama".to_string(),
            family: "mistral".to_string(),
            context_window: "32k tokens".to_string(),
            install_size: "~4.1 GB".to_string(),
            vram_requirement_gb: Some(4.1),
            install_status: "available".to_string(),
            performance_hint: "Strong all-around local model, excellent code quality".to_string(),
            warning: Some("Ollama not running — pull with: ollama pull mistral:7b".to_string()),
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
            performance_hint: "Lightweight Meta model with long context — good for quick tasks".to_string(),
            warning: Some("Ollama not running — pull with: ollama pull llama3.2:3b".to_string()),
        },
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
            warning: Some("Ollama not running — pull with: ollama pull qwen2.5-coder:7b".to_string()),
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
