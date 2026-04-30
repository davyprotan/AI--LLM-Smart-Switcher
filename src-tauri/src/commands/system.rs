use super::{CommandResponse, WarningLevel};
use serde::Serialize;
use sysinfo::{Disks, System, MINIMUM_CPU_UPDATE_INTERVAL};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSummary {
    pub profile: HardwareProfile,
    pub gauges: Vec<HardwareGauge>,
    pub recommendations: Vec<RecommendationTier>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub os: String,
    pub gpu: GpuProfile,
    pub cpu: CpuProfile,
    pub memory: MemoryProfile,
    pub disk: DiskProfile,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuProfile {
    pub name: String,
    pub vendor: String,
    pub vram_gb: Option<f64>,
    pub driver: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuProfile {
    pub name: String,
    pub cores: u64,
    pub threads: u64,
    pub architecture: String,
    pub frequency_ghz: Option<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfile {
    pub total_gb: f64,
    pub free_gb: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskProfile {
    pub total_gb: f64,
    pub free_gb: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareGauge {
    pub id: String,
    pub label: String,
    pub used: f64,
    pub total: f64,
    pub unit: String,
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationTier {
    pub id: String,
    pub label: String,
    pub rationale: String,
    pub models: Vec<String>,
}

#[tauri::command]
pub fn get_system_summary() -> CommandResponse<HardwareSummary> {
    let mut system = System::new_all();
    system.refresh_all();

    std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_cpu_usage();
    system.refresh_memory();

    let disks = Disks::new_with_refreshed_list();

    let total_disk_bytes: u64 = disks.list().iter().map(|disk| disk.total_space()).sum();
    let free_disk_bytes: u64 = disks
        .list()
        .iter()
        .map(|disk| disk.available_space())
        .sum();

    let total_memory_bytes = system.total_memory();
    let free_memory_bytes = system.available_memory();
    let cpu_threads = system.cpus().len() as u64;
    let cpu_cores = System::physical_core_count().unwrap_or(system.cpus().len()) as u64;

    let cpu_name = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .filter(|name| !name.trim().is_empty())
        .or_else(|| {
            system
                .cpus()
                .first()
                .map(|cpu| cpu.name().to_string())
                .filter(|name| !name.trim().is_empty())
        })
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let cpu_frequency_ghz = system
        .cpus()
        .first()
        .map(|cpu| cpu.frequency() as f64 / 1_000.0)
        .filter(|frequency| *frequency > 0.0)
        .map(round_one_decimal);

    let gpu_info = crate::gpu::detect();
    let gpu_detected = gpu_info.vendor != "Unknown" || gpu_info.name != "Not detected";
    let gpu_vram_total = gpu_info.vram_total_gb.unwrap_or(0.0);
    let gpu_vram_used = gpu_info.vram_used_gb.unwrap_or(0.0);
    let gpu_detail = if gpu_detected {
        "At detection".to_string()
    } else {
        "Not detected".to_string()
    };

    let summary = HardwareSummary {
        profile: HardwareProfile {
            os: System::long_os_version()
                .or_else(System::name)
                .unwrap_or_else(|| "Unknown OS".to_string()),
            gpu: GpuProfile {
                name: gpu_info.name,
                vendor: gpu_info.vendor,
                vram_gb: gpu_info.vram_total_gb,
                driver: gpu_info.driver,
            },
            cpu: CpuProfile {
                name: cpu_name,
                cores: cpu_cores,
                threads: cpu_threads,
                architecture: System::cpu_arch(),
                frequency_ghz: cpu_frequency_ghz,
            },
            memory: MemoryProfile {
                total_gb: bytes_to_gb(total_memory_bytes),
                free_gb: bytes_to_gb(free_memory_bytes),
            },
            disk: DiskProfile {
                total_gb: bytes_to_gb(total_disk_bytes),
                free_gb: bytes_to_gb(free_disk_bytes),
            },
        },
        gauges: vec![
            HardwareGauge {
                id: "gpu".to_string(),
                label: "GPU VRAM".to_string(),
                used: gpu_vram_used,
                total: gpu_vram_total,
                unit: "GB".to_string(),
                detail: gpu_detail,
            },
            HardwareGauge {
                id: "ram".to_string(),
                label: "System RAM".to_string(),
                used: round_one_decimal(bytes_to_gb(total_memory_bytes.saturating_sub(free_memory_bytes))),
                total: bytes_to_gb(total_memory_bytes),
                unit: "GB".to_string(),
                detail: "Live memory headroom".to_string(),
            },
            HardwareGauge {
                id: "cpu".to_string(),
                label: "CPU Load".to_string(),
                used: round_one_decimal(system.global_cpu_usage() as f64),
                total: 100.0,
                unit: "%".to_string(),
                detail: "Aggregate CPU usage".to_string(),
            },
            HardwareGauge {
                id: "disk".to_string(),
                label: "Disk Used".to_string(),
                used: round_one_decimal(bytes_to_gb(total_disk_bytes.saturating_sub(free_disk_bytes))),
                total: bytes_to_gb(total_disk_bytes),
                unit: "GB".to_string(),
                detail: "Combined local storage".to_string(),
            },
        ],
        recommendations: build_recommendations(cpu_cores, total_memory_bytes),
    };

    let mut response = CommandResponse::native("system", summary);

    if !gpu_detected {
        response = response.with_warning(
            "gpu-detection-pending",
            WarningLevel::Info,
            "GPU detection did not find a recognized device on this system; local-model recommendations remain conservative.",
        );
    }

    if disks.list().is_empty() {
        response = response.with_warning(
            "disk-list-empty",
            WarningLevel::Warn,
            "No disks were reported by sysinfo, so disk capacity may be incomplete on this system.",
        );
    }

    response
}

fn build_recommendations(cpu_cores: u64, total_memory_bytes: u64) -> Vec<RecommendationTier> {
    let total_memory_gb = bytes_to_gb(total_memory_bytes);

    let optimal_models = if total_memory_gb >= 32.0 {
        vec![
            "Claude Sonnet 4.5".to_string(),
            "GPT-4o".to_string(),
            "DeepSeek Coder 33B".to_string(),
        ]
    } else {
        vec![
            "Claude Sonnet 4.5".to_string(),
            "GPT-4o mini".to_string(),
            "Mistral 7B".to_string(),
        ]
    };

    let fast_models = if cpu_cores >= 8 {
        vec![
            "Mistral 7B".to_string(),
            "Claude Haiku 4.5".to_string(),
            "GPT-4o mini".to_string(),
        ]
    } else {
        vec![
            "Llama 3.2 3B GGUF".to_string(),
            "Claude Haiku 4.5".to_string(),
            "Gemini 2.0 Flash".to_string(),
        ]
    };

    vec![
        RecommendationTier {
            id: "optimal".to_string(),
            label: "Optimal".to_string(),
            rationale: "Best fit for quality-heavy development work based on current CPU and RAM visibility.".to_string(),
            models: optimal_models,
        },
        RecommendationTier {
            id: "balanced".to_string(),
            label: "Balanced".to_string(),
            rationale: "A steady balance of responsiveness and capability while GPU detection is still pending.".to_string(),
            models: vec![
                "Gemini 2.0 Flash".to_string(),
                "Qwen 2.5 Coder 7B".to_string(),
                "Claude Sonnet 4.5".to_string(),
            ],
        },
        RecommendationTier {
            id: "fast".to_string(),
            label: "Fast".to_string(),
            rationale: "Lower-latency options for terminals, autocomplete, and lighter systems.".to_string(),
            models: fast_models,
        },
    ]
}

fn bytes_to_gb(bytes: u64) -> f64 {
    round_one_decimal(bytes as f64 / 1_073_741_824.0)
}

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
