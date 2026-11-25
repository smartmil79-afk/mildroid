import { invoke } from '@tauri-apps/api/core';
import type { AppInventory, DeviceScan } from '../types';

export async function scanDevices(): Promise<DeviceScan> {
  return invoke<DeviceScan>('list_android_devices');
}

export async function scanInstalledApps(serial: string): Promise<AppInventory> {
  return invoke<AppInventory>('list_installed_android_apps', { serial });
}
