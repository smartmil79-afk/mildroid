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
    let line = line.trim();
    let rest = line.strip_prefix("package:")?;
    let mut package_name = None;
    let mut apk_path = None;
    let mut installer = None;
    let mut version_code = None;

    for part in rest.split_whitespace() {
        if let Some((key, value)) = part.split_once('=') {
            match key {
                "name" => package_name = Some(value.to_string()),
                "installer" => installer = if value == "null" { None } else { Some(value.to_string()) },
                "versionCode" => version_code = Some(value.to_string()),
                _ => {}
            }
        } else if part.contains(".apk") || part.starts_with('/') {
            apk_path = Some(part.to_string());
        } else if package_name.is_none() && part.contains('.') {
            package_name = Some(part.to_string());
        }
    }

    let package_name = package_name?;
    let category = if apk_path.as_deref().is_some_and(|p| p.starts_with("/data/app/")) {
        "user"
    } else if apk_path.is_some() {
        "system"
    } else {
        "unknown"
    };

    Some(InstalledApp {
        package_name,
        apk_path,
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
}