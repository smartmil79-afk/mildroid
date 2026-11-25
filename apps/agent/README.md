# MIFASK Local Agent (preview)

The agent bridges the web dashboard to Android Debug Bridge on the same Windows computer.

## Requirements
- Node.js 20+
- Android Platform Tools (ADB) available on PATH, or set MIFASK_ADB_PATH.
- USB debugging enabled and this computer authorised on the phone.

## Start (PowerShell)
    $env:MIFASK_WEB_ORIGIN="http://localhost:5173"
    node .\server.mjs

Copy the access token printed in the terminal into the dashboard. Keep it private. For a hosted dashboard, configure its exact origin in MIFASK_WEB_ORIGIN before starting the agent.

## Security
- Binds only to 127.0.0.1.
- Requires a random bearer token for device listing.
- Allows one explicitly configured browser origin; no wildcard CORS.
- Uses argument-based process spawning with no shell.
- Exposes only read-only ADB device discovery; no arbitrary command or package-management endpoint.
- Do not expose this port through a router, firewall, tunnel, or public network.
