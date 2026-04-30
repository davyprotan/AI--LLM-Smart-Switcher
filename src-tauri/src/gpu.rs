use std::process::Command;

pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub vram_total_gb: Option<f64>,
    pub vram_used_gb: Option<f64>,
    pub driver: String,
}

impl GpuInfo {
    fn unknown() -> Self {
        GpuInfo {
            name: "Not detected".to_string(),
            vendor: "Unknown".to_string(),
            vram_total_gb: None,
            vram_used_gb: None,
            driver: "Not detected".to_string(),
        }
    }
}

pub fn detect() -> GpuInfo {
    #[cfg(target_os = "macos")]
    {
        return detect_macos().unwrap_or_else(GpuInfo::unknown);
    }
    #[cfg(target_os = "windows")]
    {
        return detect_windows().unwrap_or_else(GpuInfo::unknown);
    }
    #[cfg(target_os = "linux")]
    {
        return detect_linux().unwrap_or_else(GpuInfo::unknown);
    }
    #[allow(unreachable_code)]
    GpuInfo::unknown()
}

/// Poll current VRAM usage without a full re-detect. Returns None when unsupported.
pub fn poll_vram_used_gb() -> Option<f64> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    if let Some(gb) = poll_nvidia_vram_used() {
        return Some(gb);
    }
    #[cfg(target_os = "linux")]
    if let Some(gb) = poll_amd_vram_used_sysfs() {
        return Some(gb);
    }
    None
}

// ── NVIDIA (Linux + Windows) ─────────────────────────────────────────────────

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn poll_nvidia_vram_used() -> Option<f64> {
    let output = Command::new("nvidia-smi")
        .args(["--query-gpu=memory.used", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let mib: f64 = String::from_utf8_lossy(&output.stdout).trim().parse().ok()?;
    Some(mib_to_gb(mib))
}

// ── AMD sysfs (Linux polling) ────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn poll_amd_vram_used_sysfs() -> Option<f64> {
    use std::fs;
    let drm = std::path::Path::new("/sys/class/drm");
    for entry in fs::read_dir(drm).ok()?.flatten() {
        let path = entry.path();
        let fname = entry.file_name();
        let s = fname.to_string_lossy();
        if !s.starts_with("card") || s.contains('-') {
            continue;
        }
        let vendor_path = path.join("device/vendor");
        let vendor = fs::read_to_string(&vendor_path).unwrap_or_default();
        if !vendor.trim().eq_ignore_ascii_case("0x1002") {
            continue;
        }
        let used_path = path.join("device/mem_info_vram_used");
        if let Ok(raw) = fs::read_to_string(&used_path) {
            if let Ok(bytes) = raw.trim().parse::<u64>() {
                return Some(bytes_to_gb(bytes));
            }
        }
    }
    None
}

// ── macOS ────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn detect_macos() -> Option<GpuInfo> {
    let output = Command::new("system_profiler")
        .args(["SPDisplaysDataType", "-json"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let gpu = json.get("SPDisplaysDataType")?.as_array()?.first()?;

    let name = gpu
        .get("sppci_model")
        .or_else(|| gpu.get("_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown GPU")
        .to_string();

    let vendor_raw = gpu
        .get("sppci_vendor")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let vendor = infer_vendor(vendor_raw, &name);

    // Discrete VRAM first; Apple Silicon reports shared memory
    let vram_total_gb = parse_macos_vram(gpu, "spdisplays_vram")
        .or_else(|| parse_macos_vram(gpu, "spdisplays_vram_shared"));

    let driver = gpu
        .get("spdisplays_driver")
        .and_then(|v| v.as_str())
        .unwrap_or("macOS built-in")
        .to_string();

    Some(GpuInfo {
        name,
        vendor,
        vram_total_gb,
        vram_used_gb: None, // Metal API needed; not available from CLI
        driver,
    })
}

#[cfg(target_os = "macos")]
fn parse_macos_vram(gpu: &serde_json::Value, key: &str) -> Option<f64> {
    let raw = gpu.get(key)?.as_str()?;
    let clean = raw.replace("Shared", "").replace("shared", "");
    let mut parts = clean.split_whitespace();
    let amount: f64 = parts.next()?.parse().ok()?;
    match parts.next()?.to_uppercase().as_str() {
        "GB" => Some(round1(amount)),
        "MB" => Some(round1(amount / 1024.0)),
        _ => None,
    }
}

// ── Windows ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn detect_windows() -> Option<GpuInfo> {
    detect_windows_powershell().or_else(detect_windows_wmic)
}

#[cfg(target_os = "windows")]
fn detect_windows_powershell() -> Option<GpuInfo> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-WmiObject Win32_VideoController | Select-Object -First 1 Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    gpu_from_windows_json(&json)
}

#[cfg(target_os = "windows")]
fn detect_windows_wmic() -> Option<GpuInfo> {
    let output = Command::new("wmic")
        .args([
            "path",
            "win32_VideoController",
            "get",
            "Name,AdapterRAM,DriverVersion",
            "/format:csv",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    // CSV columns: Node, AdapterRAM, DriverVersion, Name
    for line in text.lines().skip(2) {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 4 {
            continue;
        }
        let name = parts[3].trim().to_string();
        if name.is_empty() {
            continue;
        }
        let vram_bytes: u64 = parts[1].trim().parse().unwrap_or(0);
        let driver = parts[2].trim().to_string();
        return Some(GpuInfo {
            vendor: infer_vendor("", &name),
            vram_total_gb: if vram_bytes > 0 {
                Some(bytes_to_gb(vram_bytes))
            } else {
                None
            },
            vram_used_gb: None,
            name,
            driver,
        });
    }
    None
}

#[cfg(target_os = "windows")]
fn gpu_from_windows_json(json: &serde_json::Value) -> Option<GpuInfo> {
    let name = json
        .get("Name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown GPU")
        .to_string();
    let vram_bytes = json.get("AdapterRAM").and_then(|v| v.as_u64()).unwrap_or(0);
    let driver = json
        .get("DriverVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    Some(GpuInfo {
        vendor: infer_vendor("", &name),
        vram_total_gb: if vram_bytes > 0 {
            Some(bytes_to_gb(vram_bytes))
        } else {
            None
        },
        vram_used_gb: None,
        name,
        driver,
    })
}

// ── Linux ────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn detect_linux() -> Option<GpuInfo> {
    detect_linux_nvidia()
        .or_else(detect_linux_amd_sysfs)
        .or_else(detect_linux_lspci)
}

#[cfg(target_os = "linux")]
fn detect_linux_nvidia() -> Option<GpuInfo> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.used,driver_version",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next()?;
    let parts: Vec<&str> = line.split(',').map(str::trim).collect();
    if parts.len() < 4 {
        return None;
    }
    let total_mib: f64 = parts[1].parse().ok()?;
    let used_mib: f64 = parts[2].parse().unwrap_or(0.0);
    Some(GpuInfo {
        name: parts[0].to_string(),
        vendor: "NVIDIA".to_string(),
        vram_total_gb: Some(mib_to_gb(total_mib)),
        vram_used_gb: Some(mib_to_gb(used_mib)),
        driver: parts[3].to_string(),
    })
}

#[cfg(target_os = "linux")]
fn detect_linux_amd_sysfs() -> Option<GpuInfo> {
    use std::fs;
    let drm = std::path::Path::new("/sys/class/drm");
    for entry in fs::read_dir(drm).ok()?.flatten() {
        let path = entry.path();
        let fname = entry.file_name();
        let s = fname.to_string_lossy();
        if !s.starts_with("card") || s.contains('-') {
            continue;
        }
        let vendor = fs::read_to_string(path.join("device/vendor")).unwrap_or_default();
        if !vendor.trim().eq_ignore_ascii_case("0x1002") {
            continue;
        }
        let total_bytes: u64 = fs::read_to_string(path.join("device/mem_info_vram_total"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        let used_bytes: u64 = fs::read_to_string(path.join("device/mem_info_vram_used"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        let pci_id = fs::read_to_string(path.join("device/uevent"))
            .ok()
            .and_then(|c| {
                c.lines()
                    .find(|l| l.starts_with("PCI_ID="))
                    .map(|l| format!("AMD GPU ({})", &l[7..]))
            })
            .unwrap_or_else(|| "AMD GPU".to_string());
        return Some(GpuInfo {
            name: pci_id,
            vendor: "AMD".to_string(),
            vram_total_gb: if total_bytes > 0 {
                Some(bytes_to_gb(total_bytes))
            } else {
                None
            },
            vram_used_gb: if used_bytes > 0 {
                Some(bytes_to_gb(used_bytes))
            } else {
                None
            },
            driver: "amdgpu".to_string(),
        });
    }
    None
}

#[cfg(target_os = "linux")]
fn detect_linux_lspci() -> Option<GpuInfo> {
    let output = Command::new("lspci").args(["-mm"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let lower = line.to_lowercase();
        if !lower.contains("vga") && !lower.contains("3d controller") && !lower.contains("display") {
            continue;
        }
        // lspci -mm format: "Slot" "Class" "Vendor" "Device" ...
        let parts: Vec<&str> = line
            .split('"')
            .filter(|s| !s.trim().is_empty() && !s.trim().eq(","))
            .collect();
        let name = parts.get(3).copied().unwrap_or("Unknown GPU").to_string();
        let vendor_raw = parts.get(2).copied().unwrap_or("");
        return Some(GpuInfo {
            vendor: infer_vendor(vendor_raw, &name),
            name,
            vram_total_gb: None,
            vram_used_gb: None,
            driver: "unknown".to_string(),
        });
    }
    None
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn infer_vendor(hint: &str, name: &str) -> String {
    let combined = format!("{} {}", hint, name).to_lowercase();
    if combined.contains("nvidia") {
        "NVIDIA".to_string()
    } else if combined.contains("amd") || combined.contains("radeon") || combined.contains("advanced micro") {
        "AMD".to_string()
    } else if combined.contains("intel") {
        "Intel".to_string()
    } else if combined.contains("apple") {
        "Apple".to_string()
    } else if hint.is_empty() {
        "Unknown".to_string()
    } else {
        hint.to_string()
    }
}

#[allow(dead_code)]
fn bytes_to_gb(bytes: u64) -> f64 {
    round1(bytes as f64 / 1_073_741_824.0)
}

#[allow(dead_code)]
fn mib_to_gb(mib: f64) -> f64 {
    round1(mib / 1024.0)
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}
