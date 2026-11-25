export type AndroidDevice = {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  device?: string;
};

export type DeviceScan = {
  devices: AndroidDevice[];
  adbAvailable: boolean;
  message: string;
};

export type InstalledApp = {
  packageName: string;
  apkPath?: string;
  installer?: string;
  versionCode?: string;
  category: 'user' | 'system' | 'unknown' | string;
};

export type AppInventory = {
  apps: InstalledApp[];
  deviceSerial: string;
  scannedAt: string;
  message: string;
};
