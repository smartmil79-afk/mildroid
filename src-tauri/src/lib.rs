mod adb;

use adb::{list_devices, DeviceScan};

#[tauri::command]
fn list_android_devices() -> DeviceScan {
    list_devices()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_android_devices])
        .run(tauri::generate_context!())
        .expect("error while running MIFASK Android Cleaner");
}