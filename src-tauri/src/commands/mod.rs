use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

pub mod benchmark;
pub mod integrations;
pub mod models;
pub mod snapshots;
pub mod switcher;
pub mod system;
pub mod telemetry;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WarningLevel {
    Info,
    Warn,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandWarning {
    pub code: String,
    pub level: WarningLevel,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandMeta {
    pub area: &'static str,
    pub source: &'static str,
    pub generated_at_epoch_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse<T> {
    pub data: T,
    pub warnings: Vec<CommandWarning>,
    pub meta: CommandMeta,
}

impl<T> CommandResponse<T> {
    pub fn native(area: &'static str, data: T) -> Self {
        Self {
            data,
            warnings: Vec::new(),
            meta: CommandMeta {
                area,
                source: "native",
                generated_at_epoch_ms: now_epoch_ms(),
            },
        }
    }

    pub fn with_warning(mut self, code: &str, level: WarningLevel, message: impl Into<String>) -> Self {
        self.warnings.push(CommandWarning {
            code: code.to_string(),
            level,
            message: message.into(),
        });
        self
    }
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
