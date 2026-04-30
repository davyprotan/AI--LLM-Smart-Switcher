use super::integrations::{discover_supported_integrations, DiscoveredIntegration};
use super::{CommandResponse, WarningLevel};
use crate::utils::{home_dir, xdg_config_home};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{copy, create_dir_all, read_dir, read_to_string, rename, write};
use std::path::{Path, PathBuf};

// ── Backup sidecar ───────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupMeta {
    tool_id: String,
    config_path: String,
    created_at: String,
    backup_file: String,
}

// ── Public payload types ─────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchChange {
    pub key: String,
    pub from: Option<String>,
    pub to: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchPlanPayload {
    pub tool_id: String,
    pub tool: String,
    pub config_path: String,
    pub path_exists: bool,
    pub path_readable: bool,
    pub path_writable: bool,
    pub current_provider: Option<String>,
    pub current_model: Option<String>,
    pub proposed_provider: String,
    pub proposed_model: String,
    pub changes: Vec<SwitchChange>,
    pub can_apply: bool,
    pub block_reason: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub id: String,
    pub tool_id: String,
    pub config_path: String,
    pub backup_path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListPayload {
    pub backups: Vec<BackupEntry>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertPayload {
    pub backup_path: String,
    pub config_path: String,
    pub tool_id: String,
    pub reverted: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySwitchPayload {
    pub tool_id: String,
    pub tool: String,
    pub config_path: String,
    pub backup_path: Option<String>,
    pub changes_applied: Vec<SwitchChange>,
    pub verified: bool,
    pub rolled_back: bool,
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn preview_switch_plan(
    tool_id: String,
    proposed_provider: String,
    proposed_model: String,
) -> CommandResponse<SwitchPlanPayload> {
    let discovery = discover_supported_integrations();

    let integration = discovery.data.integrations.into_iter().find(|i| i.id == tool_id);

    let Some(integration) = integration else {
        return not_found_response(tool_id, proposed_provider, proposed_model);
    };

    let mut response = build_plan_response(integration, proposed_provider, proposed_model, &discovery.warnings);

    response = response.with_warning(
        "write-not-implemented",
        WarningLevel::Info,
        "Preview is read-only. Use apply to write the change with an automatic backup.",
    );

    response
}

#[tauri::command]
pub fn apply_switch_plan(
    tool_id: String,
    proposed_provider: String,
    proposed_model: String,
) -> CommandResponse<ApplySwitchPayload> {
    let discovery = discover_supported_integrations();

    let integration = match discovery.data.integrations.into_iter().find(|i| i.id == tool_id) {
        Some(i) => i,
        None => {
            let payload = ApplySwitchPayload {
                tool_id: tool_id.clone(),
                tool: tool_id.clone(),
                config_path: String::new(),
                backup_path: None,
                changes_applied: Vec::new(),
                verified: false,
                rolled_back: false,
            };
            return CommandResponse::native("switcher", payload).with_warning(
                "tool-not-found",
                WarningLevel::Error,
                format!("Integration '{tool_id}' was not found in discovery results."),
            );
        }
    };

    let (can_apply, block_reason) = evaluate_apply_readiness(&integration);

    if !can_apply {
        let payload = ApplySwitchPayload {
            tool_id: integration.id,
            tool: integration.tool,
            config_path: integration.config_path,
            backup_path: None,
            changes_applied: Vec::new(),
            verified: false,
            rolled_back: false,
        };
        return CommandResponse::native("switcher", payload).with_warning(
            "apply-blocked",
            WarningLevel::Error,
            block_reason.unwrap_or_else(|| "Apply was blocked for an unknown reason.".to_string()),
        );
    }

    let current_provider = normalize_label(&integration.provider_label);
    let current_model = normalize_label(&integration.assigned_model_label);

    let mut changes = Vec::new();
    if current_provider.as_deref() != Some(proposed_provider.as_str()) {
        changes.push(SwitchChange { key: "provider".to_string(), from: current_provider, to: proposed_provider.clone() });
    }
    if current_model.as_deref() != Some(proposed_model.as_str()) {
        changes.push(SwitchChange { key: "model".to_string(), from: current_model, to: proposed_model.clone() });
    }

    if changes.is_empty() {
        let payload = ApplySwitchPayload {
            tool_id: integration.id,
            tool: integration.tool,
            config_path: integration.config_path,
            backup_path: None,
            changes_applied: Vec::new(),
            verified: true,
            rolled_back: false,
        };
        return CommandResponse::native("switcher", payload).with_warning(
            "no-changes",
            WarningLevel::Info,
            "Proposed values already match the current config. Nothing was written.",
        );
    }

    let config_path = expand_display_path(&integration.config_path);

    // Backup
    let backup_path = match backup_config(&config_path, &integration.id, &integration.config_path) {
        Ok(path) => Some(path),
        Err(error) => {
            let payload = ApplySwitchPayload {
                tool_id: integration.id,
                tool: integration.tool,
                config_path: integration.config_path,
                backup_path: None,
                changes_applied: Vec::new(),
                verified: false,
                rolled_back: false,
            };
            return CommandResponse::native("switcher", payload).with_warning(
                "backup-failed",
                WarningLevel::Error,
                format!("Could not write backup before applying: {error}. No changes were made."),
            );
        }
    };

    // Patch + atomic write
    let write_result = patch_and_write(&config_path, &proposed_provider, &proposed_model);

    match write_result {
        Err(error) => {
            // Restore from backup if we have one
            let rolled_back = if let Some(ref bk) = backup_path {
                restore_backup(bk, &config_path).is_ok()
            } else {
                false
            };

            let payload = ApplySwitchPayload {
                tool_id: integration.id,
                tool: integration.tool,
                config_path: integration.config_path,
                backup_path: backup_path.map(|p| p.display().to_string()),
                changes_applied: Vec::new(),
                verified: false,
                rolled_back,
            };

            CommandResponse::native("switcher", payload).with_warning(
                "write-failed",
                WarningLevel::Error,
                format!(
                    "Write failed: {error}. {}",
                    if rolled_back { "The original config was restored from backup." } else { "Rollback was not possible." }
                ),
            )
        }

        Ok(()) => {
            // Verify: re-parse the written file
            let verified = verify_written_file(&config_path, &proposed_provider, &proposed_model);

            if !verified {
                // Re-parse failed — restore from backup
                let rolled_back = if let Some(ref bk) = backup_path {
                    restore_backup(bk, &config_path).is_ok()
                } else {
                    false
                };

                let payload = ApplySwitchPayload {
                    tool_id: integration.id,
                    tool: integration.tool,
                    config_path: integration.config_path,
                    backup_path: backup_path.map(|p| p.display().to_string()),
                    changes_applied: Vec::new(),
                    verified: false,
                    rolled_back,
                };

                return CommandResponse::native("switcher", payload).with_warning(
                    "verify-failed",
                    WarningLevel::Error,
                    format!(
                        "The written config could not be re-parsed. {}",
                        if rolled_back { "The original config was restored from backup." } else { "Rollback was not possible." }
                    ),
                );
            }

            let payload = ApplySwitchPayload {
                tool_id: integration.id,
                tool: integration.tool,
                config_path: integration.config_path,
                backup_path: backup_path.map(|p| p.display().to_string()),
                changes_applied: changes,
                verified: true,
                rolled_back: false,
            };

            let mut response = CommandResponse::native("switcher", payload).with_warning(
                "apply-success",
                WarningLevel::Info,
                "Config updated and verified. A backup was saved before the change was applied.",
            );

            for warning in discovery.warnings {
                response = response.with_warning(&warning.code, warning.level, warning.message.clone());
            }

            response
        }
    }
}

// ── Backup commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_backups() -> CommandResponse<BackupListPayload> {
    let dir = backup_storage_dir();

    if !dir.exists() {
        return CommandResponse::native("switcher", BackupListPayload { backups: Vec::new() }).with_warning(
            "no-backups",
            WarningLevel::Info,
            "No backup directory exists yet. Backups are created automatically when you apply a switch.",
        );
    }

    let entries = match read_dir(&dir) {
        Ok(e) => e,
        Err(error) => {
            return CommandResponse::native("switcher", BackupListPayload { backups: Vec::new() }).with_warning(
                "backup-dir-unreadable",
                WarningLevel::Warn,
                format!("Backup directory could not be read: {error}"),
            );
        }
    };

    let mut backups: Vec<BackupEntry> = entries
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| {
            let sidecar_path = e.path();
            let content = read_to_string(&sidecar_path).ok()?;
            let meta: BackupMeta = serde_json::from_str(&content).ok()?;

            let bak_path = dir.join(&meta.backup_file);
            let size_bytes = std::fs::metadata(&bak_path).map(|m| m.len()).unwrap_or(0);

            let id = sidecar_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            Some(BackupEntry {
                id,
                tool_id: meta.tool_id,
                config_path: meta.config_path,
                backup_path: bak_path.display().to_string(),
                created_at: meta.created_at,
                size_bytes,
            })
        })
        .collect();

    // Newest first
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    CommandResponse::native("switcher", BackupListPayload { backups })
}

#[tauri::command]
pub fn revert_from_backup(backup_path: String) -> CommandResponse<RevertPayload> {
    let bak = PathBuf::from(&backup_path);

    let sidecar = bak.with_extension("json");
    let sidecar_content = match read_to_string(&sidecar) {
        Ok(c) => c,
        Err(error) => {
            let payload = RevertPayload {
                backup_path,
                config_path: String::new(),
                tool_id: String::new(),
                reverted: false,
            };
            return CommandResponse::native("switcher", payload).with_warning(
                "sidecar-missing",
                WarningLevel::Error,
                format!("Backup metadata could not be read ({error}). Cannot determine where to restore."),
            );
        }
    };

    let meta: BackupMeta = match serde_json::from_str(&sidecar_content) {
        Ok(m) => m,
        Err(error) => {
            let payload = RevertPayload {
                backup_path,
                config_path: String::new(),
                tool_id: String::new(),
                reverted: false,
            };
            return CommandResponse::native("switcher", payload).with_warning(
                "sidecar-invalid",
                WarningLevel::Error,
                format!("Backup metadata is corrupt ({error}). Cannot determine where to restore."),
            );
        }
    };

    let config_path = expand_display_path(&meta.config_path);

    match restore_backup(&bak, &config_path) {
        Ok(()) => {
            let payload = RevertPayload {
                backup_path,
                config_path: meta.config_path,
                tool_id: meta.tool_id,
                reverted: true,
            };
            CommandResponse::native("switcher", payload).with_warning(
                "revert-success",
                WarningLevel::Info,
                "Config restored from backup successfully.",
            )
        }
        Err(error) => {
            let payload = RevertPayload {
                backup_path,
                config_path: meta.config_path,
                tool_id: meta.tool_id,
                reverted: false,
            };
            CommandResponse::native("switcher", payload).with_warning(
                "revert-failed",
                WarningLevel::Error,
                format!("Restore failed: {error}"),
            )
        }
    }
}

// ── Plan helpers ─────────────────────────────────────────────────────────────

fn not_found_response(
    tool_id: String,
    proposed_provider: String,
    proposed_model: String,
) -> CommandResponse<SwitchPlanPayload> {
    let payload = SwitchPlanPayload {
        tool_id: tool_id.clone(),
        tool: tool_id.clone(),
        config_path: String::new(),
        path_exists: false,
        path_readable: false,
        path_writable: false,
        current_provider: None,
        current_model: None,
        proposed_provider,
        proposed_model,
        changes: Vec::new(),
        can_apply: false,
        block_reason: Some(format!("No integration found with id '{tool_id}'.")),
    };

    CommandResponse::native("switcher", payload).with_warning(
        "tool-not-found",
        WarningLevel::Error,
        format!("Integration '{tool_id}' was not found in discovery results."),
    )
}

fn build_plan_response(
    integration: DiscoveredIntegration,
    proposed_provider: String,
    proposed_model: String,
    discovery_warnings: &[super::CommandWarning],
) -> CommandResponse<SwitchPlanPayload> {
    let current_provider = normalize_label(&integration.provider_label);
    let current_model = normalize_label(&integration.assigned_model_label);

    let mut changes = Vec::new();
    if current_provider.as_deref() != Some(proposed_provider.as_str()) {
        changes.push(SwitchChange { key: "provider".to_string(), from: current_provider.clone(), to: proposed_provider.clone() });
    }
    if current_model.as_deref() != Some(proposed_model.as_str()) {
        changes.push(SwitchChange { key: "model".to_string(), from: current_model.clone(), to: proposed_model.clone() });
    }

    let (can_apply, block_reason) = evaluate_apply_readiness(&integration);

    let mut response = CommandResponse::native(
        "switcher",
        SwitchPlanPayload {
            tool_id: integration.id,
            tool: integration.tool,
            config_path: integration.config_path,
            path_exists: integration.path_exists,
            path_readable: integration.path_readable,
            path_writable: integration.path_writable,
            current_provider,
            current_model,
            proposed_provider,
            proposed_model,
            changes,
            can_apply,
            block_reason,
        },
    );

    for warning in discovery_warnings {
        response = response.with_warning(&warning.code, warning.level, warning.message.clone());
    }

    response
}

fn evaluate_apply_readiness(integration: &DiscoveredIntegration) -> (bool, Option<String>) {
    evaluate_readiness_fields(
        integration.path_exists,
        integration.path_readable,
        integration.path_writable,
        &integration.parser_state,
    )
}

fn evaluate_readiness_fields(
    path_exists: bool,
    path_readable: bool,
    path_writable: bool,
    parser_state: &str,
) -> (bool, Option<String>) {
    if !path_exists {
        return (
            false,
            Some("The config file does not exist yet. A new file would need to be created to apply this change.".to_string()),
        );
    }
    if !path_readable {
        return (false, Some("The config file cannot be read. Check file permissions before applying.".to_string()));
    }
    if !path_writable {
        return (false, Some("The config file is not writable. Check file permissions before applying.".to_string()));
    }
    if parser_state == "invalid" {
        return (
            false,
            Some("The config file could not be parsed. Fix the file manually before applying a switch.".to_string()),
        );
    }
    (true, None)
}

fn normalize_label(label: &str) -> Option<String> {
    let trimmed = label.trim();
    let inferred_markers = [
        "inferred", "not detected", "no config file yet", "no explicit", "unknown", "unavailable",
        "provider field missing", "model field missing",
    ];
    if trimmed.is_empty() || inferred_markers.iter().any(|m| trimmed.to_lowercase().contains(m)) {
        None
    } else {
        Some(trimmed.to_string())
    }
}

// ── Write pipeline ───────────────────────────────────────────────────────────

fn backup_config(config_path: &Path, tool_id: &str, display_path: &str) -> Result<PathBuf, String> {
    let backup_dir = backup_storage_dir();
    create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let filename = format!("{tool_id}-{timestamp}.bak");
    let dest = backup_dir.join(&filename);

    if config_path.exists() {
        copy(config_path, &dest).map_err(|e| e.to_string())?;
    } else {
        write(&dest, b"__empty__").map_err(|e| e.to_string())?;
    }

    let meta = BackupMeta {
        tool_id: tool_id.to_string(),
        config_path: display_path.to_string(),
        created_at: Utc::now().to_rfc3339(),
        backup_file: filename,
    };
    let sidecar = dest.with_extension("json");
    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    write(sidecar, json.as_bytes()).map_err(|e| e.to_string())?;

    Ok(dest)
}

fn restore_backup(backup_path: &Path, config_path: &Path) -> Result<(), String> {
    let content = read_to_string(backup_path).map_err(|e| e.to_string())?;
    if content.trim() == "__empty__" {
        // Original didn't exist — remove the written file
        std::fs::remove_file(config_path).map_err(|e| e.to_string())?;
    } else {
        atomic_write(config_path, content.as_bytes())?;
    }
    Ok(())
}

fn patch_and_write(config_path: &Path, provider: &str, model: &str) -> Result<(), String> {
    let is_json = config_path.extension().and_then(|e| e.to_str()) == Some("json");

    let patched: Vec<u8> = if is_json {
        patch_json(config_path, provider, model)?
    } else {
        patch_yaml(config_path, provider, model)?
    };

    atomic_write(config_path, &patched)
}

fn patch_json(config_path: &Path, provider: &str, model: &str) -> Result<Vec<u8>, String> {
    let existing = if config_path.exists() {
        read_to_string(config_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };
    patch_json_str(&existing, provider, model)
}

fn patch_json_str(existing: &str, provider: &str, model: &str) -> Result<Vec<u8>, String> {
    let mut value: serde_json::Value = serde_json::from_str(existing)
        .map_err(|e| format!("Could not parse existing JSON before writing: {e}"))?;

    let obj = value.as_object_mut().ok_or("Config root is not a JSON object.")?;
    obj.insert("provider".to_string(), serde_json::Value::String(provider.to_string()));
    obj.insert("model".to_string(), serde_json::Value::String(model.to_string()));

    serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())
}

fn patch_yaml(config_path: &Path, provider: &str, model: &str) -> Result<Vec<u8>, String> {
    let existing = if config_path.exists() {
        read_to_string(config_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    patch_yaml_str(&existing, provider, model)
}

fn patch_yaml_str(existing: &str, provider: &str, model: &str) -> Result<Vec<u8>, String> {
    let mut value: serde_yaml::Value = if existing.trim().is_empty() {
        serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
    } else {
        serde_yaml::from_str(existing).map_err(|e| format!("Could not parse existing YAML before writing: {e}"))?
    };

    let mapping = value.as_mapping_mut().ok_or("Config root is not a YAML mapping.")?;
    mapping.insert(
        serde_yaml::Value::String("provider".to_string()),
        serde_yaml::Value::String(provider.to_string()),
    );
    mapping.insert(
        serde_yaml::Value::String("model".to_string()),
        serde_yaml::Value::String(model.to_string()),
    );

    serde_yaml::to_string(&value)
        .map(|s| s.into_bytes())
        .map_err(|e| e.to_string())
}

fn atomic_write(target: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let tmp = target.with_extension("tmp");
    write(&tmp, content).map_err(|e| format!("Could not write temp file: {e}"))?;
    rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Could not rename temp file into place: {e}")
    })
}

fn verify_written_file(config_path: &Path, expected_provider: &str, expected_model: &str) -> bool {
    let Ok(content) = read_to_string(config_path) else {
        return false;
    };
    let is_json = config_path.extension().and_then(|e| e.to_str()) == Some("json");
    verify_content(&content, is_json, expected_provider, expected_model)
}

fn verify_content(content: &str, is_json: bool, expected_provider: &str, expected_model: &str) -> bool {
    if is_json {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
            return false;
        };
        let provider_ok = value.get("provider").and_then(|v| v.as_str()) == Some(expected_provider);
        let model_ok = value.get("model").and_then(|v| v.as_str()) == Some(expected_model);
        provider_ok && model_ok
    } else {
        let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(content) else {
            return false;
        };
        let key_p = serde_yaml::Value::String("provider".to_string());
        let key_m = serde_yaml::Value::String("model".to_string());
        let provider_ok = value.get(&key_p).and_then(|v| v.as_str()) == Some(expected_provider);
        let model_ok = value.get(&key_m).and_then(|v| v.as_str()) == Some(expected_model);
        provider_ok && model_ok
    }
}

// ── Storage paths ────────────────────────────────────────────────────────────

fn backup_storage_dir() -> PathBuf {
    let tail = ["llm-switcher", "backups"];

    if env::consts::OS == "windows" {
        if let Some(app_data) = env::var_os("APPDATA") {
            return tail.iter().fold(PathBuf::from(app_data), |p, s| p.join(s));
        }
    }

    if env::consts::OS == "linux" {
        if let Some(xdg) = xdg_config_home() {
            return tail.iter().fold(xdg, |p, s| p.join(s));
        }
    }

    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".llm-switcher")
        .join("backups")
}

fn expand_display_path(display_path: &str) -> PathBuf {
    if let Some(stripped) = display_path.strip_prefix("~/") {
        return home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(stripped);
    }
    PathBuf::from(display_path)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn tmp_dir() -> PathBuf {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("llm_switcher_test_{id}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // ── normalize_label ───────────────────────────────────────────────────────

    #[test]
    fn normalize_label_empty_returns_none() {
        assert_eq!(normalize_label(""), None);
    }

    #[test]
    fn normalize_label_whitespace_returns_none() {
        assert_eq!(normalize_label("   "), None);
    }

    #[test]
    fn normalize_label_inferred_returns_none() {
        assert_eq!(normalize_label("inferred from file"), None);
        assert_eq!(normalize_label("not detected"), None);
        assert_eq!(normalize_label("Unknown"), None);
        assert_eq!(normalize_label("provider field missing"), None);
    }

    #[test]
    fn normalize_label_real_value_returns_some() {
        assert_eq!(normalize_label("anthropic"), Some("anthropic".to_string()));
        assert_eq!(normalize_label("claude-sonnet-4-6"), Some("claude-sonnet-4-6".to_string()));
    }

    #[test]
    fn normalize_label_trims_whitespace() {
        assert_eq!(normalize_label("  anthropic  "), Some("anthropic".to_string()));
    }

    // ── evaluate_readiness_fields ─────────────────────────────────────────────

    #[test]
    fn readiness_all_ok() {
        let (ok, reason) = evaluate_readiness_fields(true, true, true, "explicit");
        assert!(ok);
        assert!(reason.is_none());
    }

    #[test]
    fn readiness_blocked_when_missing() {
        let (ok, reason) = evaluate_readiness_fields(false, false, false, "missing");
        assert!(!ok);
        assert!(reason.unwrap().contains("does not exist"));
    }

    #[test]
    fn readiness_blocked_when_not_readable() {
        let (ok, reason) = evaluate_readiness_fields(true, false, true, "explicit");
        assert!(!ok);
        assert!(reason.unwrap().contains("cannot be read"));
    }

    #[test]
    fn readiness_blocked_when_not_writable() {
        let (ok, reason) = evaluate_readiness_fields(true, true, false, "explicit");
        assert!(!ok);
        assert!(reason.unwrap().contains("not writable"));
    }

    #[test]
    fn readiness_blocked_when_invalid_parser() {
        let (ok, reason) = evaluate_readiness_fields(true, true, true, "invalid");
        assert!(!ok);
        assert!(reason.unwrap().contains("could not be parsed"));
    }

    #[test]
    fn readiness_ok_for_inferred_parser() {
        // "inferred" is not "invalid" — apply should still be permitted
        let (ok, _) = evaluate_readiness_fields(true, true, true, "inferred");
        assert!(ok);
    }

    // ── patch_json_str ────────────────────────────────────────────────────────

    #[test]
    fn patch_json_sets_provider_and_model_on_empty_object() {
        let bytes = patch_json_str("{}", "anthropic", "claude-sonnet-4-6").unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["provider"], "anthropic");
        assert_eq!(v["model"], "claude-sonnet-4-6");
    }

    #[test]
    fn patch_json_updates_existing_keys() {
        let existing = r#"{"provider":"openai","model":"gpt-4o","apiKey":"abc"}"#;
        let bytes = patch_json_str(existing, "anthropic", "claude-haiku-4-5").unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["provider"], "anthropic");
        assert_eq!(v["model"], "claude-haiku-4-5");
        // Other keys must be preserved
        assert_eq!(v["apiKey"], "abc");
    }

    #[test]
    fn patch_json_returns_err_on_invalid_json() {
        let result = patch_json_str("not valid json {{", "anthropic", "model");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Could not parse"));
    }

    #[test]
    fn patch_json_returns_err_on_non_object_root() {
        let result = patch_json_str(r#"["a","b"]"#, "anthropic", "model");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a JSON object"));
    }

    // ── patch_yaml_str ────────────────────────────────────────────────────────

    #[test]
    fn patch_yaml_sets_provider_and_model_on_empty_string() {
        let bytes = patch_yaml_str("", "ollama", "mistral:7b").unwrap();
        let v: serde_yaml::Value = serde_yaml::from_slice(&bytes).unwrap();
        let key_p = serde_yaml::Value::String("provider".to_string());
        let key_m = serde_yaml::Value::String("model".to_string());
        assert_eq!(v.get(&key_p).and_then(|x| x.as_str()), Some("ollama"));
        assert_eq!(v.get(&key_m).and_then(|x| x.as_str()), Some("mistral:7b"));
    }

    #[test]
    fn patch_yaml_updates_existing_keys_and_preserves_others() {
        let existing = "provider: openai\nmodel: gpt-4o\napiKey: secret\n";
        let bytes = patch_yaml_str(existing, "anthropic", "claude-opus-4-7").unwrap();
        let v: serde_yaml::Value = serde_yaml::from_slice(&bytes).unwrap();
        let key_p = serde_yaml::Value::String("provider".to_string());
        let key_m = serde_yaml::Value::String("model".to_string());
        let key_a = serde_yaml::Value::String("apiKey".to_string());
        assert_eq!(v.get(&key_p).and_then(|x| x.as_str()), Some("anthropic"));
        assert_eq!(v.get(&key_m).and_then(|x| x.as_str()), Some("claude-opus-4-7"));
        assert_eq!(v.get(&key_a).and_then(|x| x.as_str()), Some("secret"));
    }

    #[test]
    fn patch_yaml_returns_err_on_invalid_yaml() {
        let result = patch_yaml_str("key: [unclosed bracket", "p", "m");
        assert!(result.is_err());
    }

    // ── verify_content ────────────────────────────────────────────────────────

    #[test]
    fn verify_content_json_correct_values() {
        let content = r#"{"provider":"anthropic","model":"claude-sonnet-4-6"}"#;
        assert!(verify_content(content, true, "anthropic", "claude-sonnet-4-6"));
    }

    #[test]
    fn verify_content_json_wrong_provider() {
        let content = r#"{"provider":"openai","model":"claude-sonnet-4-6"}"#;
        assert!(!verify_content(content, true, "anthropic", "claude-sonnet-4-6"));
    }

    #[test]
    fn verify_content_json_wrong_model() {
        let content = r#"{"provider":"anthropic","model":"gpt-4o"}"#;
        assert!(!verify_content(content, true, "anthropic", "claude-sonnet-4-6"));
    }

    #[test]
    fn verify_content_json_invalid_returns_false() {
        assert!(!verify_content("not json", true, "p", "m"));
    }

    #[test]
    fn verify_content_yaml_correct_values() {
        let content = "provider: ollama\nmodel: mistral:7b\n";
        assert!(verify_content(content, false, "ollama", "mistral:7b"));
    }

    #[test]
    fn verify_content_yaml_wrong_model() {
        let content = "provider: ollama\nmodel: llama3.2:3b\n";
        assert!(!verify_content(content, false, "ollama", "mistral:7b"));
    }

    // ── atomic_write ──────────────────────────────────────────────────────────

    #[test]
    fn atomic_write_creates_file_with_correct_content() {
        let dir = tmp_dir();
        let target = dir.join("config.json");
        atomic_write(&target, b"hello world").unwrap();
        let read_back = std::fs::read_to_string(&target).unwrap();
        assert_eq!(read_back, "hello world");
    }

    #[test]
    fn atomic_write_creates_parent_directories() {
        let dir = tmp_dir();
        let target = dir.join("nested").join("deep").join("config.json");
        atomic_write(&target, b"nested content").unwrap();
        assert!(target.exists());
    }

    #[test]
    fn atomic_write_leaves_no_tmp_file_on_success() {
        let dir = tmp_dir();
        let target = dir.join("config.json");
        atomic_write(&target, b"data").unwrap();
        let tmp = target.with_extension("tmp");
        assert!(!tmp.exists(), "temp file should be cleaned up after rename");
    }

    #[test]
    fn atomic_write_overwrites_existing_file() {
        let dir = tmp_dir();
        let target = dir.join("config.json");
        atomic_write(&target, b"original").unwrap();
        atomic_write(&target, b"updated").unwrap();
        let content = std::fs::read_to_string(&target).unwrap();
        assert_eq!(content, "updated");
    }

    // ── restore_backup ────────────────────────────────────────────────────────

    #[test]
    fn restore_backup_writes_content_to_target() {
        let dir = tmp_dir();
        let backup = dir.join("backup.bak");
        let target = dir.join("config.json");
        std::fs::write(&backup, b"restored content").unwrap();
        restore_backup(&backup, &target).unwrap();
        let content = std::fs::read_to_string(&target).unwrap();
        assert_eq!(content, "restored content");
    }

    #[test]
    fn restore_backup_empty_sentinel_removes_target() {
        let dir = tmp_dir();
        let backup = dir.join("backup.bak");
        let target = dir.join("config.json");
        // Target exists from a previous write
        std::fs::write(&target, b"something").unwrap();
        std::fs::write(&backup, b"__empty__").unwrap();
        restore_backup(&backup, &target).unwrap();
        assert!(!target.exists(), "target should be removed when backup was empty sentinel");
    }

    // ── backup_config ─────────────────────────────────────────────────────────

    #[test]
    fn backup_config_creates_bak_and_sidecar() {
        let dir = tmp_dir();
        let config = dir.join("config.json");
        std::fs::write(&config, br#"{"provider":"openai","model":"gpt-4o"}"#).unwrap();

        let _backup_dir = dir.join("backups");
        // Temporarily override backup storage by writing directly to backup_config's internal logic
        // is not practical; test the helper with a known dir by calling it and checking results
        // in a temp-rooted backup dir is hard without DI. Instead call backup_config directly
        // and verify the side-effects in the actual backup_storage_dir().
        // That couples to the path, so we test at the level of the backup_dir just for content.
        //
        // We call backup_config with a real path and confirm the returned PathBuf is a .bak file
        // that exists and the .json sidecar contains the expected metadata.
        let result = backup_config(&config, "claude-code", "~/path/config.json");
        assert!(result.is_ok(), "backup_config should succeed: {:?}", result.err());

        let bak_path = result.unwrap();
        assert!(bak_path.exists(), ".bak file should exist");
        assert_eq!(bak_path.extension().and_then(|e| e.to_str()), Some("bak"));

        let sidecar = bak_path.with_extension("json");
        assert!(sidecar.exists(), ".json sidecar should exist");

        let meta: BackupMeta = serde_json::from_str(&std::fs::read_to_string(&sidecar).unwrap()).unwrap();
        assert_eq!(meta.tool_id, "claude-code");
        assert_eq!(meta.config_path, "~/path/config.json");
        assert!(!meta.backup_file.is_empty());
    }

    #[test]
    fn backup_config_nonexistent_source_writes_empty_sentinel() {
        let dir = tmp_dir();
        let config = dir.join("nonexistent.json");

        let result = backup_config(&config, "tool-x", "~/nonexistent.json");
        assert!(result.is_ok());

        let bak_path = result.unwrap();
        let content = std::fs::read_to_string(&bak_path).unwrap();
        assert_eq!(content, "__empty__");
    }
}
