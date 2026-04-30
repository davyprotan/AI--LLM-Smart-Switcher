use super::{CommandResponse, CommandWarning, WarningLevel};
use crate::utils::{home_dir, xdg_config_home};
use serde::Serialize;
use std::env;
use std::fs::{metadata, read_to_string, File};
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationDiscoveryPayload {
    pub integrations: Vec<DiscoveredIntegration>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredIntegration {
    pub id: String,
    pub tool: String,
    pub config_path: String,
    pub status: String,
    pub provider_label: String,
    pub assigned_model_label: String,
    pub repair_hint: String,
    pub path_exists: bool,
    pub path_readable: bool,
    pub path_writable: bool,
    pub discovery_method: String,
    pub parser_state: String,
    pub parser_note: String,
}

#[tauri::command]
pub fn discover_supported_integrations() -> CommandResponse<IntegrationDiscoveryPayload> {
    let entries = [
        ("claude-code",   "Claude Code",  build_claude_candidates(),   "Known Claude Code settings/config paths",           "Claude Code parsing is conservative — if no explicit routing override is found the default Anthropic path is shown as an inference only.", IntegrationKind::ClaudeCode),
        ("vscode",        "VS Code",      build_vscode_fork_candidates("Code"),       "VS Code user settings path",                        "VS Code itself has no standard LLM provider key. AI extension configs (e.g. Continue.dev) are discovered via the Continue entry.",              IntegrationKind::VsCode),
        ("cursor",        "Cursor",       build_vscode_fork_candidates("Cursor"),     "Cursor user settings path",                         "Cursor stores its model override in settings.json. If no provider/model key is found the built-in Cursor AI is assumed.",                    IntegrationKind::Cursor),
        ("windsurf",      "Windsurf",     build_vscode_fork_candidates("Windsurf"),   "Windsurf user settings path",                       "Windsurf stores its model override in settings.json. If no provider/model key is found the built-in Windsurf AI is assumed.",                IntegrationKind::Windsurf),
        ("continue",      "Continue.dev", build_continue_candidates(),               "Continue.dev cross-editor config path",             "Continue.dev stores provider/model inside the models array of config.json. The first model entry's fields are shown.",                      IntegrationKind::ContinueDev),
        ("terminal",      "Terminal",     build_terminal_candidates(),               "App-managed terminal config candidates",             "Terminal discovery checks the app-managed config path. If no file exists yet, parsing is skipped.",                                         IntegrationKind::Terminal),
    ];

    let mut integrations = Vec::new();
    let mut all_warnings = Vec::new();

    for (id, tool, candidates, discovery_method, repair_hint, kind) in entries {
        let result = inspect_integration(id, tool, &candidates, discovery_method, repair_hint, kind);
        integrations.push(result.integration);
        all_warnings.extend(result.warnings);
    }

    let mut response = CommandResponse::native("integrations", IntegrationDiscoveryPayload { integrations });
    response.warnings.extend(all_warnings);

    if home_dir().is_none() && current_platform() != "windows" {
        response = response.with_warning(
            "home-dir-missing",
            WarningLevel::Warn,
            "The home directory could not be resolved, so integration discovery paths may be incomplete.",
        );
    }

    response.with_warning(
        "integration-scope-limited",
        WarningLevel::Info,
        "JetBrains and Neovim use XML/Lua configs that are not yet machine-parseable; manage those manually for now.",
    )
}

struct IntegrationInspection {
    integration: DiscoveredIntegration,
    warnings: Vec<CommandWarning>,
}

fn inspect_integration(
    id: &str,
    tool: &str,
    candidates: &[PathBuf],
    discovery_method: &str,
    repair_hint: &str,
    kind: IntegrationKind,
) -> IntegrationInspection {
    match choose_existing_or_first(candidates) {
        Some(path_buf) => {
            let exists = path_buf.exists();
            let readable = exists && File::open(&path_buf).is_ok();
            let writable = is_writable(&path_buf, exists);
            let parse_result = if readable {
                parse_integration_file(&path_buf, kind)
            } else {
                ParseOutcome::missing()
            };

            // All reachable: choose_existing_or_first returned Some, so candidates is non-empty.
            let status = if exists && readable && writable {
                "connected"
            } else if exists {
                "attention"
            } else {
                "missing"
            };

            IntegrationInspection {
                integration: DiscoveredIntegration {
                    id: id.to_string(),
                    tool: tool.to_string(),
                    config_path: shorten_home(&path_buf),
                    status: status.to_string(),
                    provider_label: parse_result.provider_label,
                    assigned_model_label: parse_result.assigned_model_label,
                    repair_hint: format!(
                        "{} {}",
                        repair_hint,
                        candidate_summary(candidates, &path_buf)
                    )
                    .trim()
                    .to_string(),
                    path_exists: exists,
                    path_readable: readable,
                    path_writable: writable,
                    discovery_method: format!(
                        "{} · {}",
                        discovery_method,
                        candidate_summary(candidates, &path_buf)
                    ),
                    parser_state: parse_result.parser_state.to_string(),
                    parser_note: parse_result.parser_note.clone(),
                },
                warnings: parse_result
                    .warning_message
                    .into_iter()
                    .map(|message| CommandWarning {
                        code: format!("{id}-parser-{}", parse_result.parser_state),
                        level: parse_result.warning_level,
                        message,
                    })
                    .collect(),
            }
        }
        None => IntegrationInspection {
            integration: DiscoveredIntegration {
                id: id.to_string(),
                tool: tool.to_string(),
                config_path: "Unavailable".to_string(),
                status: "unsupported".to_string(),
                provider_label: "Unknown".to_string(),
                assigned_model_label: "Unknown".to_string(),
                repair_hint: "This platform path could not be resolved yet.".to_string(),
                path_exists: false,
                path_readable: false,
                path_writable: false,
                discovery_method: discovery_method.to_string(),
                parser_state: "missing".to_string(),
                parser_note: "No candidate path could be resolved.".to_string(),
            },
            warnings: Vec::new(),
        },
    }
}

fn build_claude_candidates() -> Vec<PathBuf> {
    match current_platform() {
        "windows" => {
            let mut candidates = Vec::new();

            if let Some(user_profile) = env_path("USERPROFILE") {
                candidates.push(user_profile.join(".claude").join("settings.json"));
                candidates.push(user_profile.join(".claude").join("config.json"));
            }

            if let Some(app_data) = env_path("APPDATA") {
                candidates.push(app_data.join("Claude").join("settings.json"));
                candidates.push(app_data.join("Claude").join("config.json"));
            }

            candidates
        }
        "linux" => {
            let mut candidates = Vec::new();

            if let Some(home) = home_dir() {
                candidates.push(home.join(".claude").join("settings.json"));
                candidates.push(home.join(".claude").join("config.json"));
            }

            if let Some(xdg_config) = xdg_config_home() {
                candidates.push(xdg_config.join("claude").join("settings.json"));
                candidates.push(xdg_config.join("claude").join("config.json"));
            }

            dedupe_paths(candidates)
        }
        _ => home_dir()
            .map(|home| {
                vec![
                    home.join(".claude").join("settings.json"),
                    home.join(".claude").join("config.json"),
                ]
            })
            .unwrap_or_default(),
    }
}

fn build_terminal_candidates() -> Vec<PathBuf> {
    match current_platform() {
        "windows" => {
            let mut candidates = Vec::new();

            if let Some(app_data) = env_path("APPDATA") {
                candidates.push(app_data.join("llm-switcher").join("config.yaml"));
            }

            if let Some(local_app_data) = env_path("LOCALAPPDATA") {
                candidates.push(local_app_data.join("llm-switcher").join("config.yaml"));
            }

            if let Some(user_profile) = env_path("USERPROFILE") {
                candidates.push(user_profile.join(".llm-switcher").join("config.yaml"));
            }

            dedupe_paths(candidates)
        }
        "linux" => {
            let mut candidates = Vec::new();

            if let Some(xdg_config) = xdg_config_home() {
                candidates.push(xdg_config.join("llm-switcher").join("config.yaml"));
            }

            if let Some(home) = home_dir() {
                candidates.push(home.join(".llm-switcher").join("config.yaml"));
            }

            dedupe_paths(candidates)
        }
        _ => home_dir()
            .map(|home| {
                vec![
                    home.join(".llm-switcher").join("config.yaml"),
                    home.join(".config").join("llm-switcher").join("config.yaml"),
                ]
            })
            .unwrap_or_default(),
    }
}

/// VS Code / Cursor / Windsurf — all store user settings at the same relative path
/// inside the OS-specific app-support directory.
fn build_vscode_fork_candidates(app_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    match current_platform() {
        "windows" => {
            if let Some(app_data) = env_path("APPDATA") {
                candidates.push(app_data.join(app_name).join("User").join("settings.json"));
            }
        }
        "linux" => {
            if let Some(xdg) = xdg_config_home() {
                candidates.push(xdg.join(app_name).join("User").join("settings.json"));
            }
            if let Some(home) = home_dir() {
                candidates.push(
                    home.join(".config")
                        .join(app_name)
                        .join("User")
                        .join("settings.json"),
                );
            }
        }
        _ => {
            // macOS: ~/Library/Application Support/<App>/User/settings.json
            if let Some(home) = home_dir() {
                candidates.push(
                    home.join("Library")
                        .join("Application Support")
                        .join(app_name)
                        .join("User")
                        .join("settings.json"),
                );
            }
        }
    }

    dedupe_paths(candidates)
}

fn build_continue_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(home) = home_dir() {
        // Standard location used by the VS Code and JetBrains Continue extensions
        candidates.push(home.join(".continue").join("config.json"));
    }

    if current_platform() == "linux" {
        if let Some(xdg) = xdg_config_home() {
            candidates.push(xdg.join("continue").join("config.json"));
        }
    }

    dedupe_paths(candidates)
}

fn choose_existing_or_first(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates
        .iter()
        .find(|candidate| candidate.exists())
        .cloned()
        .or_else(|| candidates.first().cloned())
}

fn is_writable(path: &Path, exists: bool) -> bool {
    let target = if exists {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };

    metadata(target)
        .map(|entry| !entry.permissions().readonly())
        .unwrap_or(false)
}

fn shorten_home(path: &Path) -> String {
    if let Some(home) = home_dir() {
        if let Ok(relative) = path.strip_prefix(home) {
            return format!("~/{}", relative.display());
        }
    }

    path.display().to_string()
}

fn current_platform() -> &'static str {
    env::consts::OS
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name).map(PathBuf::from)
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut deduped: Vec<PathBuf> = Vec::new();

    for path in paths {
        if !deduped.iter().any(|existing| existing == &path) {
            deduped.push(path);
        }
    }

    deduped
}

#[derive(Clone, Copy)]
enum IntegrationKind {
    ClaudeCode,
    Terminal,
    VsCode,
    Cursor,
    Windsurf,
    ContinueDev,
}

struct ParseOutcome {
    provider_label: String,
    assigned_model_label: String,
    parser_state: &'static str,
    parser_note: String,
    warning_level: WarningLevel,
    warning_message: Option<String>,
}

impl ParseOutcome {
    fn missing() -> Self {
        Self {
            provider_label: "Not detected".to_string(),
            assigned_model_label: "No config file yet".to_string(),
            parser_state: "missing",
            parser_note: "No readable config file was available to parse.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: None,
        }
    }
}

fn parse_integration_file(path: &Path, kind: IntegrationKind) -> ParseOutcome {
    let content = match read_to_string(path) {
        Ok(content) => content,
        Err(_) => {
            return ParseOutcome {
                provider_label: "Unreadable config".to_string(),
                assigned_model_label: "Could not parse".to_string(),
                parser_state: "invalid",
                parser_note: "The config file exists but could not be read.".to_string(),
                warning_level: WarningLevel::Warn,
                warning_message: Some(format!(
                    "{} could not be read, so provider/model state may be incomplete.",
                    path.display()
                )),
            }
        }
    };

    if path.extension().and_then(|value| value.to_str()) == Some("json") {
        parse_json_content(&content, kind)
    } else {
        parse_yaml_content(&content, kind)
    }
}

fn parse_json_content(content: &str, kind: IntegrationKind) -> ParseOutcome {
    let value: serde_json::Value = match serde_json::from_str(content) {
        Ok(value) => value,
        Err(_) => {
            return ParseOutcome {
                provider_label: "Invalid JSON".to_string(),
                assigned_model_label: "Could not parse".to_string(),
                parser_state: "invalid",
                parser_note: "The JSON file could not be parsed safely.".to_string(),
                warning_level: WarningLevel::Warn,
                warning_message: Some(
                    "A discovered JSON config is invalid, so routing data may be incomplete."
                        .to_string(),
                ),
            }
        }
    };

    build_parse_outcome(
        find_string_value_in_json(&value, &["provider", "apiProvider", "defaultProvider"]),
        find_string_value_in_json(&value, &["model", "defaultModel", "modelName"]),
        kind,
    )
}

fn parse_yaml_content(content: &str, kind: IntegrationKind) -> ParseOutcome {
    let value: serde_yaml::Value = match serde_yaml::from_str(content) {
        Ok(value) => value,
        Err(_) => {
            return ParseOutcome {
                provider_label: "Invalid YAML".to_string(),
                assigned_model_label: "Could not parse".to_string(),
                parser_state: "invalid",
                parser_note: "The YAML file could not be parsed safely.".to_string(),
                warning_level: WarningLevel::Warn,
                warning_message: Some(
                    "A discovered YAML config is invalid, so routing data may be incomplete."
                        .to_string(),
                ),
            }
        }
    };

    build_parse_outcome(
        find_string_value_in_yaml(&value, &["provider", "apiProvider", "defaultProvider"]),
        find_string_value_in_yaml(&value, &["model", "defaultModel", "modelName"]),
        kind,
    )
}

fn build_parse_outcome(
    provider: Option<String>,
    model: Option<String>,
    kind: IntegrationKind,
) -> ParseOutcome {
    if provider.is_some() || model.is_some() {
        return ParseOutcome {
            provider_label: provider.unwrap_or_else(|| "Provider field missing".to_string()),
            assigned_model_label: model.unwrap_or_else(|| "Model field missing".to_string()),
            parser_state: "explicit",
            parser_note: "At least one explicit provider/model field was found.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: None,
        };
    }

    match kind {
        IntegrationKind::ClaudeCode => ParseOutcome {
            provider_label: "Anthropic default (inferred)".to_string(),
            assigned_model_label: "No explicit model override".to_string(),
            parser_state: "inferred",
            parser_note: "No explicit provider/model override was found; default Claude routing is inferred.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: Some("Claude Code does not expose an explicit provider/model override in the discovered config, so the displayed routing is inferred.".to_string()),
        },
        IntegrationKind::VsCode => ParseOutcome {
            provider_label: "No LLM provider key found".to_string(),
            assigned_model_label: "No LLM model key found".to_string(),
            parser_state: "inferred",
            parser_note: "VS Code settings.json has no standard LLM provider/model key. Use the Continue.dev entry to manage routing via that extension.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: None,
        },
        IntegrationKind::Cursor => ParseOutcome {
            provider_label: "Cursor built-in AI (inferred)".to_string(),
            assigned_model_label: "No explicit model override".to_string(),
            parser_state: "inferred",
            parser_note: "No explicit provider/model key found in Cursor settings; built-in Cursor AI routing is assumed.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: None,
        },
        IntegrationKind::Windsurf => ParseOutcome {
            provider_label: "Windsurf built-in AI (inferred)".to_string(),
            assigned_model_label: "No explicit model override".to_string(),
            parser_state: "inferred",
            parser_note: "No explicit provider/model key found in Windsurf settings; built-in Windsurf AI routing is assumed.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: None,
        },
        IntegrationKind::ContinueDev => ParseOutcome {
            provider_label: "No provider configured".to_string(),
            assigned_model_label: "No model configured".to_string(),
            parser_state: "inferred",
            parser_note: "Continue.dev config.json was found but no provider/model keys were extracted. The models array may be empty.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: Some("Continue.dev config exists but no provider/model was extracted — the models array may be empty or use a non-standard key.".to_string()),
        },
        IntegrationKind::Terminal => ParseOutcome {
            provider_label: "No explicit provider configured".to_string(),
            assigned_model_label: "No explicit model configured".to_string(),
            parser_state: "inferred",
            parser_note: "No explicit provider/model keys were found in the app-managed terminal config.".to_string(),
            warning_level: WarningLevel::Info,
            warning_message: Some("Terminal discovery found no explicit provider/model keys, so the displayed routing is inferred.".to_string()),
        },
    }
}

fn find_string_value_in_json(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(found) = map.get(*key).and_then(|entry| entry.as_str()) {
                    return Some(found.to_string());
                }
            }

            for nested in map.values() {
                if let Some(found) = find_string_value_in_json(nested, keys) {
                    return Some(found);
                }
            }

            None
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|entry| find_string_value_in_json(entry, keys)),
        _ => None,
    }
}

fn find_string_value_in_yaml(value: &serde_yaml::Value, keys: &[&str]) -> Option<String> {
    match value {
        serde_yaml::Value::Mapping(map) => {
            for key in keys {
                let yaml_key = serde_yaml::Value::String((*key).to_string());
                if let Some(found) = map.get(&yaml_key).and_then(|entry| entry.as_str()) {
                    return Some(found.to_string());
                }
            }

            for nested in map.values() {
                if let Some(found) = find_string_value_in_yaml(nested, keys) {
                    return Some(found);
                }
            }

            None
        }
        serde_yaml::Value::Sequence(items) => items
            .iter()
            .find_map(|entry| find_string_value_in_yaml(entry, keys)),
        _ => None,
    }
}

fn candidate_summary(candidates: &[PathBuf], selected: &Path) -> String {
    if candidates.len() <= 1 {
        return "single candidate".to_string();
    }

    let selected_index = candidates
        .iter()
        .position(|candidate| candidate == selected)
        .map(|index| index + 1)
        .unwrap_or(1);

    format!("selected candidate {} of {}", selected_index, candidates.len())
}
