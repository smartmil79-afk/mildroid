import { invoke } from '@tauri-apps/api/core';
import type { AppInventory, DeviceHealth, DeviceScan } from '../types';

export async function configureAdbPath(path: string): Promise<string> {
  return invoke<string>('configure_adb_path', { path: path.trim() || null });
}

export async function scanDevices(): Promise<DeviceScan> {
  await configureAdbPath(localStorage.getItem('mifask-adb-path') || '');
  return invoke<DeviceScan>('list_android_devices');
}

export async function scanInstalledApps(serial: string): Promise<AppInventory> {
  return invoke<AppInventory>('list_installed_android_apps', { serial });
}

export async function scanDeviceHealth(serial: string): Promise<DeviceHealth> {
  return invoke<DeviceHealth>('get_android_device_health', { serial });
}

export async function openAndroidAppSettings(serial: string, packageName: string): Promise<string> {
  return invoke<string>('open_android_app_settings', { serial, packageName });
}
