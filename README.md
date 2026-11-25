# MIFASK Android Cleaner

Windows desktop Android device inspection and package-management utility.

## Stack
- Tauri 2 + Rust
- React + TypeScript + Vite
- Android Debug Bridge (ADB)
- Local-first; SQLite-backed history planned

## Current implementation
- Dark navy and cyan visual identity with light/dark theme toggle
- ADB device detection through the Rust command layer
- Device model, product, serial and connection state display
- Safe-by-default: no package modifications are exposed in this foundation

## Requirements
- Windows 10/11
- Node.js 22+
- Rust stable with Windows build prerequisites
- Android Platform Tools (`adb`) available on PATH, or `MIFASK_ADB_PATH` set to `adb.exe`

## Development
```powershell
npm install
npm run tauri dev
```

## Checks
```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Android connection
1. Enable Developer options and USB debugging on the phone.
2. Connect by USB and approve the computer's debugging authorisation prompt.
3. Run **Scan devices**.
4. Devices marked `unauthorized` need approval; `offline` devices need connection troubleshooting.

## Safety
This initial release only detects devices. It does not disable, uninstall, or alter Android packages. Future package operations must require device-specific verification, explicit confirmation, a recoverable prior-state record, and post-operation validation.

## Windows build
The `Windows release build` GitHub Actions workflow produces NSIS/MSI bundles and uploads them as workflow artifacts. Run it manually from Actions or push a `v*` tag.

Copyright (c) MIFASK. See LICENSE.