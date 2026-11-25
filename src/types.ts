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