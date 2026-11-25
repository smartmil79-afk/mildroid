# Architecture

MIFASK Android Cleaner is a Windows-first Tauri 2 desktop application.

- React + TypeScript + Vite render the UI.
- Rust exposes narrow Tauri commands.
- ADB is invoked as a child process; no shell interpolation is used.
- Device discovery currently runs `adb devices -l`.
- A future package-management engine must be separate from discovery and must include risk checks, explicit consent, state capture, audit history and post-operation verification.

## Device states

- `device`: connected and authorised.
- `unauthorized`: approve the computer on the phone.
- `offline`: ADB sees the transport but cannot communicate.
- Other states are surfaced without attempting changes.

## Security boundaries

No root, bootloader unlocking, or package modification is performed in the initial foundation. The UI cannot issue arbitrary shell commands. ADB operations are allow-listed in the Rust layer.
