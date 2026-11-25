# MIFASK Android Cleaner

A multi-client Android device management project: Windows desktop application, browser dashboard, and a local ADB companion agent.

## Editions

### Web dashboard (MVP)
- Responsive React + TypeScript + Vite interface
- Device connection overview, read-only ADB device list, safety status, light/dark theme
- Connects to the local Windows agent; a hosted website cannot directly access USB/ADB

Start the local agent in PowerShell:
    cd apps/agent
    $env:MIFASK_WEB_ORIGIN="http://localhost:5173"
    node .\server.mjs

Start the web dashboard in another terminal:
    cd apps/web
    npm install
    npm run dev

Open http://localhost:5173 and paste the access token printed by the agent. See docs/WEB-EDITION.md.

### Windows desktop foundation
- Tauri 2 + Rust + React + TypeScript
- ADB device detection through the Rust command layer
- Dark navy/cyan visual identity with light/dark theme
- Safe-by-default: no package modifications exposed in the current foundation

Requirements: Windows 10/11, Node.js 22+, Rust stable with Windows build prerequisites, and Android Platform Tools (ADB).

Development:
    npm install
    npm run tauri dev

## Safety and scope
The web agent binds to 127.0.0.1, requires a bearer token, allows one explicitly configured browser origin, and exposes only read-only device discovery. Do not expose its port publicly. Package inventory, risk classification, backup/restore, and package changes are not implemented in the web MVP. Future write operations must require per-action confirmation, strict allowlists, critical-package safeguards, and audit logging.

The desktop foundation currently detects devices only. Do not treat either edition as a complete package cleaner until package inventory and safe package workflows have been implemented and tested.

## Project structure
- apps/web — browser dashboard
- apps/agent — local Windows ADB bridge
- src and src-tauri — Windows desktop application
- docs — architecture and implementation notes

Copyright (c) MIFASK. See LICENSE.