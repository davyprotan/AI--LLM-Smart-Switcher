mod commands;
mod gpu;
mod utils;

use commands::telemetry::TelemetryHandle;

pub fn run() {
    tauri::Builder::default()
        .manage(TelemetryHandle::new())
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_summary,
            commands::integrations::discover_supported_integrations,
            commands::models::list_available_models,
            commands::models::pull_ollama_model,
            commands::switcher::preview_switch_plan,
            commands::switcher::apply_switch_plan,
            commands::switcher::list_backups,
            commands::switcher::revert_from_backup,
            commands::snapshots::list_snapshots,
            commands::snapshots::capture_baseline_snapshot,
            commands::snapshots::list_snapshot_diff,
            commands::snapshots::restore_snapshot_stub,
            commands::benchmark::run_benchmark,
            commands::telemetry::start_hardware_telemetry,
            commands::telemetry::stop_hardware_telemetry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LLM Smart Switcher");
}
