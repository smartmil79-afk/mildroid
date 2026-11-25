import { invoke } from '@tauri-apps/api/core';
import type { DeviceScan } from '../types';

export async function scanDevices(): Promise<DeviceScan> {
  return invoke<DeviceScan>('list_android_devices');
}