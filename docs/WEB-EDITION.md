# MIFASK Android Cleaner — Web edition

## MVP topology
- Web dashboard (apps/web): responsive React/Vite interface for device overview, local-agent connection, device list, safety status, and theme selection.
- Local agent (apps/agent): Windows-side Node service that invokes the installed ADB binary and exposes a narrow loopback API.
- Desktop edition (src and src-tauri): existing Tauri client remains separate.

## Trust boundary
A hosted browser cannot access arbitrary USB/ADB interfaces. The user runs the local agent on the same PC as the phone. The agent binds to IPv4 loopback only, requires a bearer token, validates one configured Origin, and exposes device discovery only. Never publish the agent port.

## Run the web MVP
1. In one terminal: cd apps/agent, set MIFASK_WEB_ORIGIN=http://localhost:5173, then run node server.mjs.
2. In another terminal: cd apps/web, run npm install, then npm run dev.
3. Open http://localhost:5173, paste the token printed by the agent, and scan.

## Current scope
Read-only ADB device discovery. Package inventory, risk classification, backup/restore, and package-management actions are not implemented in this web MVP. Future write operations require explicit user confirmation, fixed allowlists, critical-package protection, and audit logging.
