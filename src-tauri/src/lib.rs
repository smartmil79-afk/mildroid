mod adb;

use adb::{get_device_health, list_devices, list_installed_apps, set_adb_path, AppInventory, DeviceHealth, DeviceScan};

#[tauri::command]
fn configure_adb_path(path: Option<String>) -> Result<String, String> {
    set_adb_path(path)
}

#[tauri::command]
fn list_android_devices() -> DeviceScan {
    list_devices()
}

#[tauri::command]
fn list_installed_android_apps(serial: String) -> Result<AppInventory, String> {
    list_installed_apps(&serial)
}

#[tauri::command]
fn get_android_device_health(serial: String) -> Result<DeviceHealth, String> {
    get_device_health(&serial)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            configure_adb_path,
            list_android_devices,
            list_installed_android_apps,
            get_android_device_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running MIFASK Android Cleaner");
}
