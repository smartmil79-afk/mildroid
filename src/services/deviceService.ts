import { invoke } from '@tauri-apps/api/core';
import type { DeviceScan } from '../types';

export async function scanDevices(): Promise<DeviceScan> {
  return invoke<DeviceScan>('list_android_devices');
}
export async function scanInstalledApps(serial: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  const { } = await import('../types');
  return invoke<import('../types').AppInventory>('list_installed_android_apps', { serial });
}
