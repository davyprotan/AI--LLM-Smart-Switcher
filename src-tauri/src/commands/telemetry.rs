use serde::Serialize;
use tauri::Emitter;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{Disks, System, MINIMUM_CPU_UPDATE_INTERVAL};

pub struct TelemetryHandle(pub Arc<AtomicBool>);

impl TelemetryHandle {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPayload {
    pub cpu_usage_pct: f64,
    pub ram_used_gb: f64,
    pub ram_total_gb: f64,
    pub disk_used_gb: f64,
    pub disk_total_gb: f64,
    pub vram_used_gb: Option<f64>,
    pub vram_total_gb: Option<f64>,
    pub timestamp_ms: u64,
}

#[tauri::command]
pub fn start_hardware_telemetry(
    app: tauri::AppHandle,
    handle: tauri::State<TelemetryHandle>,
    interval_ms: u64,
) {
    let was_running = handle.0.swap(true, Ordering::SeqCst);
    if was_running {
        return;
    }

    let running = handle.0.clone();
    let tick = interval_ms.max(MINIMUM_CPU_UPDATE_INTERVAL.as_millis() as u64 + 50);

    std::thread::spawn(move || {
        let mut system = System::new_all();

        // Detect GPU once at thread start to get static total VRAM
        let gpu_static = crate::gpu::detect();
        let vram_total_gb = gpu_static.vram_total_gb;

        while running.load(Ordering::SeqCst) {
            system.refresh_all();
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
            system.refresh_cpu_usage();
            system.refresh_memory();

            let disks = Disks::new_with_refreshed_list();
            let total_disk: u64 = disks.list().iter().map(|d| d.total_space()).sum();
            let free_disk: u64 = disks.list().iter().map(|d| d.available_space()).sum();

            let total_ram = system.total_memory();
            let free_ram = system.available_memory();

            // Poll live VRAM usage (NVIDIA nvidia-smi / AMD sysfs); None on Apple or when tool absent
            let vram_used_gb = crate::gpu::poll_vram_used_gb();

            let payload = TelemetryPayload {
                cpu_usage_pct: round_one(system.global_cpu_usage() as f64),
                ram_used_gb: bytes_to_gb(total_ram.saturating_sub(free_ram)),
                ram_total_gb: bytes_to_gb(total_ram),
                disk_used_gb: bytes_to_gb(total_disk.saturating_sub(free_disk)),
                disk_total_gb: bytes_to_gb(total_disk),
                vram_used_gb,
                vram_total_gb,
                timestamp_ms: now_ms(),
            };

            if app.emit("hardware-telemetry", payload).is_err() {
                break;
            }

            let remaining = tick.saturating_sub(MINIMUM_CPU_UPDATE_INTERVAL.as_millis() as u64);
            if remaining > 0 {
                std::thread::sleep(Duration::from_millis(remaining));
            }
        }
    });
}

#[tauri::command]
pub fn stop_hardware_telemetry(handle: tauri::State<TelemetryHandle>) {
    handle.0.store(false, Ordering::SeqCst);
}

fn bytes_to_gb(bytes: u64) -> f64 {
    round_one(bytes as f64 / 1_073_741_824.0)
}

fn round_one(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
