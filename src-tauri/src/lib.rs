mod adb;

use adb::{list_devices, list_installed_apps, AppInventory, DeviceScan};

#[tauri::command]
fn list_android_devices() -> DeviceScan {
    list_devices()
}

#[tauri::command]
fn list_installed_android_apps(serial: String) -> Result<AppInventory, String> {
    list_installed_apps(&serial)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_android_devices,
            list_installed_android_apps
        ])
        .run(tauri::generate_context!())
        .expect("error while running MIFASK Android Cleaner");
}
