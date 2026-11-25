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

fn adb_executable() -> String {
    std::env::var("MIFASK_ADB_PATH").unwrap_or_else(|_| "adb".to_string())
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
}