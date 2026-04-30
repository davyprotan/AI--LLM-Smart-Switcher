use super::integrations::{discover_supported_integrations, DiscoveredIntegration};
use super::{CommandResponse, WarningLevel};
use crate::utils::{home_dir, xdg_config_home};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{create_dir_all, read_to_string, write};
use std::path::PathBuf;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotStorePayload {
    pub baseline: Option<BaselineSnapshot>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDiffPayload {
    pub baseline_id: Option<String>,
    pub entries: Vec<SnapshotDiffEntry>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineSnapshot {
    pub id: String,
    pub created_at: String,
    pub storage_path: String,
    pub entries: Vec<BaselineSnapshotEntry>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineSnapshotEntry {
    pub id: String,
    pub tool: String,
    pub config_path: String,
    pub status: String,
    pub provider_label: String,
    pub assigned_model_label: String,
    pub path_exists: bool,
    pub path_readable: bool,
    pub path_writable: bool,
    pub discovery_method: String,
    pub parser_state: String,
    pub parser_note: String,
    pub checksum: Option<String>,
    pub content_length: Option<usize>,
    #[serde(skip_serializing)]
    pub content: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDiffEntry {
    pub id: String,
    pub tool: String,
    pub state: String,
    pub changed_fields: Vec<String>,
    pub baseline_provider_label: Option<String>,
    pub current_provider_label: Option<String>,
    pub baseline_model_label: Option<String>,
    pub current_model_label: Option<String>,
    pub baseline_checksum: Option<String>,
    pub current_checksum: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotFile {
    baseline: BaselineSnapshot,
}

#[tauri::command]
pub fn list_snapshots() -> CommandResponse<SnapshotStorePayload> {
    match read_snapshot_file() {
        Ok(Some(snapshot)) => CommandResponse::native(
            "snapshots",
            SnapshotStorePayload {
                baseline: Some(strip_content(snapshot)),
            },
        ),
        Ok(None) => CommandResponse::native("snapshots", SnapshotStorePayload { baseline: None })
            .with_warning(
                "baseline-missing",
                WarningLevel::Info,
                "No baseline snapshot has been captured yet.",
            ),
        Err(error) => CommandResponse::native("snapshots", SnapshotStorePayload { baseline: None })
            .with_warning(
                "baseline-read-failed",
                WarningLevel::Warn,
                format!("The baseline snapshot could not be read: {error}"),
            ),
    }
}

#[tauri::command]
pub fn capture_baseline_snapshot() -> CommandResponse<SnapshotStorePayload> {
    let discovery = discover_supported_integrations();
    let entries = discovery
        .data
        .integrations
        .into_iter()
        .map(build_snapshot_entry)
        .collect::<Vec<_>>();

    let storage_path = snapshot_storage_path();
    let candidate_baseline = BaselineSnapshot {
        id: "baseline".to_string(),
        created_at: iso_timestamp(),
        storage_path: storage_path.display().to_string(),
        entries,
    };

    let mut response = match read_snapshot_file() {
        Ok(Some(existing)) => {
            if baseline_fingerprint(&existing) == baseline_fingerprint(&candidate_baseline) {
                CommandResponse::native(
                    "snapshots",
                    SnapshotStorePayload {
                        baseline: Some(strip_content(existing)),
                    },
                )
                .with_warning(
                    "baseline-unchanged",
                    WarningLevel::Info,
                    "The existing baseline already matches the current discovered state, so it was left untouched.",
                )
            } else {
                CommandResponse::native(
                    "snapshots",
                    SnapshotStorePayload {
                        baseline: Some(strip_content(existing)),
                    },
                )
                .with_warning(
                    "baseline-immutable",
                    WarningLevel::Warn,
                    "A baseline snapshot already exists and remains immutable. Delete or rotate it in a future management flow if you need a replacement baseline.",
                )
            }
        }
        Ok(None) => match persist_snapshot_file(&candidate_baseline) {
            Ok(()) => CommandResponse::native(
                "snapshots",
                SnapshotStorePayload {
                    baseline: Some(strip_content(candidate_baseline)),
                },
            )
            .with_warning(
                "baseline-captured",
                WarningLevel::Info,
                "Baseline snapshot captured locally for supported integrations.",
            ),
            Err(error) => {
                CommandResponse::native("snapshots", SnapshotStorePayload { baseline: None })
                    .with_warning(
                        "baseline-write-failed",
                        WarningLevel::Error,
                        format!("The baseline snapshot could not be written: {error}"),
                    )
            }
        },
        Err(error) => {
            CommandResponse::native("snapshots", SnapshotStorePayload { baseline: None })
                .with_warning(
                    "baseline-read-failed",
                    WarningLevel::Error,
                    format!(
                        "The existing baseline snapshot could not be read before capture: {error}"
                    ),
                )
        }
    };

    for warning in discovery.warnings {
        response = response.with_warning(&warning.code, warning.level, warning.message);
    }

    response
}

#[tauri::command]
pub fn list_snapshot_diff() -> CommandResponse<SnapshotDiffPayload> {
    let current = discover_supported_integrations();
    let current_entries = current
        .data
        .integrations
        .into_iter()
        .map(build_snapshot_entry)
        .collect::<Vec<_>>();

    let mut response = match read_snapshot_file() {
        Ok(Some(baseline)) => CommandResponse::native(
            "snapshots",
            SnapshotDiffPayload {
                baseline_id: Some(baseline.id.clone()),
                entries: build_diff_entries(&baseline.entries, &current_entries),
            },
        ),
        Ok(None) => CommandResponse::native(
            "snapshots",
            SnapshotDiffPayload {
                baseline_id: None,
                entries: Vec::new(),
            },
        )
        .with_warning(
            "baseline-missing",
            WarningLevel::Info,
            "Capture a baseline snapshot before diff preview can compare current state against it.",
        ),
        Err(error) => CommandResponse::native(
            "snapshots",
            SnapshotDiffPayload {
                baseline_id: None,
                entries: Vec::new(),
            },
        )
        .with_warning(
            "baseline-read-failed",
            WarningLevel::Warn,
            format!("The baseline snapshot could not be read for diff preview: {error}"),
        ),
    };

    for warning in current.warnings {
        response = response.with_warning(&warning.code, warning.level, warning.message);
    }

    response
}

#[tauri::command]
pub fn restore_snapshot_stub(_snapshot_id: String) -> CommandResponse<&'static str> {
    CommandResponse::native(
        "snapshots",
        "Restore and revert-all flows still need filesystem-safe write logic.",
    )
}

fn build_snapshot_entry(integration: DiscoveredIntegration) -> BaselineSnapshotEntry {
    let source_path = expand_display_path(&integration.config_path);
    let content = if integration.path_exists && integration.path_readable {
        read_to_string(&source_path).ok()
    } else {
        None
    };

    let checksum = content.as_ref().map(|text| checksum_for_text(text));
    let content_length = content.as_ref().map(|text| text.len());

    BaselineSnapshotEntry {
        id: integration.id,
        tool: integration.tool,
        config_path: integration.config_path,
        status: integration.status,
        provider_label: integration.provider_label,
        assigned_model_label: integration.assigned_model_label,
        path_exists: integration.path_exists,
        path_readable: integration.path_readable,
        path_writable: integration.path_writable,
        discovery_method: integration.discovery_method,
        parser_state: integration.parser_state,
        parser_note: integration.parser_note,
        checksum,
        content_length,
        content,
    }
}

fn strip_content(mut snapshot: BaselineSnapshot) -> BaselineSnapshot {
    for entry in &mut snapshot.entries {
        entry.content = None;
    }

    snapshot
}

fn persist_snapshot_file(snapshot: &BaselineSnapshot) -> Result<(), String> {
    let path = snapshot_storage_path();

    if let Some(parent) = path.parent() {
        create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file = SnapshotFile {
        baseline: snapshot.clone(),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|error| error.to_string())?;

    write(path, json).map_err(|error| error.to_string())
}

fn read_snapshot_file() -> Result<Option<BaselineSnapshot>, String> {
    let path = snapshot_storage_path();

    if !path.exists() {
        return Ok(None);
    }

    let content = read_to_string(path).map_err(|error| error.to_string())?;
    let file: SnapshotFile = serde_json::from_str(&content).map_err(|error| error.to_string())?;

    Ok(Some(file.baseline))
}

fn snapshot_storage_path() -> PathBuf {
    let tail = ["llm-switcher", "snapshots", "baseline.json"];

    if env::consts::OS == "windows" {
        if let Some(app_data) = env::var_os("APPDATA") {
            return tail.iter().fold(PathBuf::from(app_data), |p, s| p.join(s));
        }
    }

    if env::consts::OS == "linux" {
        // Use XDG_CONFIG_HOME (falls back to ~/.config) so the path is
        // consistent with where integrations.rs looks for terminal configs.
        if let Some(xdg) = xdg_config_home() {
            return tail.iter().fold(xdg, |p, s| p.join(s));
        }
    }

    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".llm-switcher")
        .join("snapshots")
        .join("baseline.json")
}

fn expand_display_path(display_path: &str) -> PathBuf {
    if let Some(stripped) = display_path.strip_prefix("~/") {
        return home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(stripped);
    }

    PathBuf::from(display_path)
}

fn checksum_for_text(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn iso_timestamp() -> String {
    Utc::now().to_rfc3339()
}

fn baseline_fingerprint(snapshot: &BaselineSnapshot) -> String {
    let mut records = snapshot
        .entries
        .iter()
        .map(|entry| {
            format!(
                "{}|{}|{}|{}|{}|{}|{}",
                entry.id,
                entry.config_path,
                entry.status,
                entry.provider_label,
                entry.assigned_model_label,
                entry.parser_state,
                entry.checksum.clone().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>();
    records.sort();
    records.join("\n")
}

fn build_diff_entries(
    baseline_entries: &[BaselineSnapshotEntry],
    current_entries: &[BaselineSnapshotEntry],
) -> Vec<SnapshotDiffEntry> {
    let mut diffs = Vec::new();

    for baseline in baseline_entries {
        if let Some(current) = current_entries.iter().find(|entry| entry.id == baseline.id) {
            let mut changed_fields = Vec::new();

            if baseline.provider_label != current.provider_label {
                changed_fields.push("provider".to_string());
            }
            if baseline.assigned_model_label != current.assigned_model_label {
                changed_fields.push("model".to_string());
            }
            if baseline.status != current.status {
                changed_fields.push("status".to_string());
            }
            if baseline.checksum != current.checksum {
                changed_fields.push("checksum".to_string());
            }
            if baseline.parser_state != current.parser_state {
                changed_fields.push("parserState".to_string());
            }

            diffs.push(SnapshotDiffEntry {
                id: baseline.id.clone(),
                tool: baseline.tool.clone(),
                state: if changed_fields.is_empty() {
                    "unchanged".to_string()
                } else {
                    "changed".to_string()
                },
                changed_fields,
                baseline_provider_label: Some(baseline.provider_label.clone()),
                current_provider_label: Some(current.provider_label.clone()),
                baseline_model_label: Some(baseline.assigned_model_label.clone()),
                current_model_label: Some(current.assigned_model_label.clone()),
                baseline_checksum: baseline.checksum.clone(),
                current_checksum: current.checksum.clone(),
            });
        } else {
            diffs.push(SnapshotDiffEntry {
                id: baseline.id.clone(),
                tool: baseline.tool.clone(),
                state: "missingCurrent".to_string(),
                changed_fields: vec!["presence".to_string()],
                baseline_provider_label: Some(baseline.provider_label.clone()),
                current_provider_label: None,
                baseline_model_label: Some(baseline.assigned_model_label.clone()),
                current_model_label: None,
                baseline_checksum: baseline.checksum.clone(),
                current_checksum: None,
            });
        }
    }

    for current in current_entries {
        if baseline_entries.iter().all(|entry| entry.id != current.id) {
            diffs.push(SnapshotDiffEntry {
                id: current.id.clone(),
                tool: current.tool.clone(),
                state: "newCurrent".to_string(),
                changed_fields: vec!["presence".to_string()],
                baseline_provider_label: None,
                current_provider_label: Some(current.provider_label.clone()),
                baseline_model_label: None,
                current_model_label: Some(current.assigned_model_label.clone()),
                baseline_checksum: None,
                current_checksum: current.checksum.clone(),
            });
        }
    }

    diffs
}
