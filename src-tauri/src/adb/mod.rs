use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidDevice {
    pub serial: String,
    pub state: String,
    pub model: Option<String>,
    pub product: Option<String>,
    pub device: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceScan {
    pub devices: Vec<AndroidDevice>,
    pub adb_available: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub package_name: String,
    pub apk_path: Option<String>,
    pub installer: Option<String>,
    pub version_code: Option<String>,
    pub category: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInventory {
    pub apps: Vec<InstalledApp>,
    pub device_serial: String,
    pub scanned_at: String,
    pub message: String,
}


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceHealth {
    pub device_serial: String,
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub android_version: Option<String>,
    pub security_patch: Option<String>,
    pub battery_level: Option<u8>,
    pub battery_status: Option<String>,
    pub battery_temperature_c: Option<f32>,
    pub storage_total_gb: Option<f32>,
    pub storage_free_gb: Option<f32>,
    pub scanned_at: String,
}

pub fn get_device_health(serial: &str) -> Result<DeviceHealth, String> {
    if serial.trim().is_empty() {
        return Err("A device serial is required.".into());
    }
    let manufacturer = adb_for(serial, &["getprop", "ro.product.manufacturer"]).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let model = adb_for(serial, &["getprop", "ro.product.model"]).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let android_version = adb_for(serial, &["getprop", "ro.build.version.release"]).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let security_patch = adb_for(serial, &["getprop", "ro.build.version.security_patch"]).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let battery = adb_for(serial, &["dumpsys", "battery"]).unwrap_or_default();
    let (battery_level, battery_status, battery_temperature_c) = parse_battery_health(&battery);
    let storage = adb_for(serial, &["df", "-k", "/data"]).unwrap_or_default();
    let (storage_total_gb, storage_free_gb) = parse_storage_health(&storage);
    Ok(DeviceHealth {
        device_serial: serial.to_string(),
        manufacturer, model, android_version, security_patch,
        battery_level, battery_status, battery_temperature_c,
        storage_total_gb, storage_free_gb,
        scanned_at: chrono_free_timestamp(),
    })
}

fn parse_battery_health(output: &str) -> (Option<u8>, Option<String>, Option<f32>) {
    let mut level = None;
    let mut status = None;
    let mut temperature = None;
    for line in output.lines() {
        let Some((key, value)) = line.trim().split_once(':') else { continue };
        let value = value.trim();
        match key.trim() {
            "level" => level = value.parse::<u8>().ok().filter(|v| *v <= 100),
            "status" => status = match value {
                "1" => Some("Unknown".into()), "2" => Some("Charging".into()),
                "3" => Some("Discharging".into()), "4" => Some("Not charging".into()),
                "5" => Some("Full".into()), _ => None,
            },
            "temperature" => temperature = value.parse::<f32>().ok().map(|v| v / 10.0),
            _ => {}
        }
    }
    (level, status, temperature)
}

fn parse_storage_health(output: &str) -> (Option<f32>, Option<f32>) {
    // Prefer the /data row when Android emits multiple mount entries.
    let line = output.lines()
        .filter(|line| !line.trim().is_empty())
        .filter(|line| !line.to_ascii_lowercase().contains("filesystem"))
        .last();
    let Some(line) = line else { return (None, None) };
    let fields = line.split_whitespace().collect::<Vec<_>>();
    if fields.len() < 4 { return (None, None); }
    // df -k reports 1K blocks: total is column 1, available is column 3.
    let (Ok(total_kib), Ok(available_kib)) =
        (fields[1].parse::<f64>(), fields[3].parse::<f64>())
    else { return (None, None) };
    (
        Some((total_kib / 1_048_576.0) as f32),
        Some((available_kib / 1_048_576.0) as f32),
    )
}

fn adb_executable() -> String {
    std::env::var("MIFASK_ADB_PATH").unwrap_or_else(|_| "adb".to_string())
}

fn adb_for(serial: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(adb_executable())
        .args(["-s", serial, "shell"])
        .args(args)
        .output()
        .map_err(|error| format!("Could not start Android Platform Tools: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn list_devices() -> DeviceScan {
    let output = match Command::new(adb_executable()).args(["devices", "-l"]).output() {
        Ok(output) => output,
        Err(_) => {
            return DeviceScan {
                devices: vec![],
                adb_available: false,
                message: "Android Platform Tools (adb) was not found. Install Platform Tools or set MIFASK_ADB_PATH to adb.exe.".into(),
            };
        }
    };

    if !output.status.success() {
        return DeviceScan {
            devices: vec![],
            adb_available: true,
            message: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let devices = stdout.lines().skip(1).filter_map(parse_device_line).collect();
    DeviceScan {
        devices,
        adb_available: true,
        message: "ADB device scan completed.".into(),
    }
}

pub fn list_installed_apps(serial: &str) -> Result<AppInventory, String> {
    if serial.trim().is_empty() {
        return Err("A device serial is required.".into());
    }
    let output = adb_for(serial, &["pm", "list", "packages", "-f", "-i", "--show-versioncode"])?;
    let mut apps = output.lines().filter_map(parse_app_line).collect::<Vec<_>>();
    apps.sort_by(|a, b| a.package_name.cmp(&b.package_name));
    Ok(AppInventory {
        apps,
        device_serial: serial.to_string(),
        scanned_at: chrono_free_timestamp(),
        message: "Read-only application inventory completed.".into(),
    })
}

fn chrono_free_timestamp() -> String {
    // Timestamp is intentionally generated without adding a runtime dependency.
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "unknown".into())
}

fn parse_app_line(line: &str) -> Option<InstalledApp> {
    let rest = line.trim().strip_prefix("package:")?;
    let (path_and_package, metadata) = rest.split_once(' ').unwrap_or((rest, ""));
    let (apk_path, package_name) = path_and_package.rsplit_once('=')?;
    if package_name.is_empty() { return None; }

    let mut installer = None;
    let mut version_code = None;
    for part in metadata.split_whitespace() {
        if let Some((key, value)) = part.split_once('=') {
            if key == "installer" && value != "null" {
                installer = Some(value.to_string());
            }
        }
        if let Some(value) = part.strip_prefix("versionCode:").or_else(|| part.strip_prefix("versionCode=")) {
            version_code = Some(value.to_string());
        }
    }

    let category = if apk_path.starts_with("/data/app/") {
        "user"
    } else if apk_path.starts_with('/') {
        "system"
    } else {
        "unknown"
    };

    Some(InstalledApp {
        package_name: package_name.to_string(),
        apk_path: Some(apk_path.to_string()),
        installer,
        version_code,
        category: category.to_string(),
    })
}

fn parse_device_line(line: &str) -> Option<AndroidDevice> {
    let mut fields = line.split_whitespace();
    let serial = fields.next()?;
    let state = fields.next()?;
    if serial == "*" {
        return None;
    }

    let (mut model, mut product, mut device) = (None, None, None);
    for field in fields {
        if let Some((key, value)) = field.split_once(':') {
            match key {
                "model" => model = Some(value.replace('_', " ")),
                "product" => product = Some(value.to_string()),
                "device" => device = Some(value.to_string()),
                _ => {}
            }
        }
    }

    Some(AndroidDevice {
        serial: serial.to_string(),
        state: state.to_string(),
        model,
        product,
        device,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_authorised_device() {
        let device = parse_device_line(
            "R58N123 device product:a54x model:SM_A546E device:a54x",
        ).unwrap();
        assert_eq!(device.serial, "R58N123");
        assert_eq!(device.state, "device");
        assert_eq!(device.model.as_deref(), Some("SM A546E"));
    }

    #[test]
    fn parses_unauthorised_device() {
        let device = parse_device_line("ABC123 unauthorized usb:1-2").unwrap();
        assert_eq!(device.state, "unauthorized");
    }

    #[test]
    fn parses_user_app_metadata() {
        let app = parse_app_line("package:/data/app/~~abc/base.apk=com.example.reader installer=com.android.vending versionCode=42").unwrap();
        assert_eq!(app.package_name, "com.example.reader");
        assert_eq!(app.category, "user");
        assert_eq!(app.version_code.as_deref(), Some("42"));
    }

    #[test]
    fn parses_system_app_metadata() {
        let app = parse_app_line("package:/system/app/Settings/Settings.apk=com.android.settings").unwrap();
        assert_eq!(app.package_name, "com.android.settings");
        assert_eq!(app.category, "system");
    }

    #[test]
    fn parses_battery_health_values() {
        let (level, status, temperature) = parse_battery_health("  level: 87\n  status: 2\n  temperature: 335");
        assert_eq!(level, Some(87));
        assert_eq!(status.as_deref(), Some("Charging"));
        assert_eq!(temperature, Some(33.5));
    }

    #[test]
    fn parses_storage_health_values() {
        let (total, free) = parse_storage_health("Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-1 104857600 52428800 52428800 50% /data");
        assert_eq!(total, Some(100.0));
        assert_eq!(free, Some(50.0));
    }
}