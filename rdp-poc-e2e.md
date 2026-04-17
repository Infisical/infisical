# Windows RDP POC: E2E test runbook

Covers running the POC end-to-end against real Infisical + a real Windows VM.

The POC is on feature branches in both repos:
- `feat/pam-rdp-poc` in `/Users/berniegandin/Repos/infisical`
- `feat/pam-rdp-poc` in `/Users/berniegandin/Repos/cli`

## Two validation paths

There are two ways to exercise the code. They prove different things.

### Path A: CLI-only (no backend)

What it proves: the Rust MITM bridge, credential injection, PDU forwarding, event tap, and Go↔Rust FFI all work end-to-end against a real Windows target.

This is what we've been running so far. It does **not** require Infisical to be running.

```
cd /Users/berniegandin/Repos/cli
go generate ./packages/pam/handlers/rdp/...   # builds the Rust static lib
go build -o /tmp/bridge-test ./packages/pam/handlers/rdp/cmd/bridge-test

/tmp/bridge-test \
  -target 'ec2-...:3389' \
  -user 'Administrator' \
  -pass '<password>' \
  -listen '127.0.0.1:3389'

# In another terminal
sdl-freerdp /v:127.0.0.1:3389 /cert:ignore /sec:tls /u:test /p:test /w:1280 /h:800
```

Expected: FreeRDP window opens, Windows desktop renders. Keyboard and mouse work. Closing the window cleanly tears down the bridge; summary counts print in the bridge-test log.

### Path B: Full gateway integration

What it proves: the RDP handler wires into the gateway dispatcher, credentials flow from the backend, session logs persist, the whole PAM lifecycle works.

This is Phase 2's exit gate. Requires a running Infisical + a registered gateway + a Windows PAM resource.

## Path B step-by-step

### Prerequisites

- Windows VM reachable from your gateway machine on port 3389 (and 5985 if you want rotation)
- Docker Desktop running
- Rust + Go toolchains installed

### Step 1. Bring up the backend

```
cd /Users/berniegandin/Repos/infisical
git checkout feat/pam-rdp-poc
cp .env.example .env
make up-dev
```

This starts Postgres + Redis + Clickhouse + backend + frontend on `http://localhost:80`. Sign in or create an account through the web UI.

### Step 2. Create a Windows resource + account

Through the PAM UI:
1. Create or open a PAM-enabled project
2. Resources → New → Windows Server
3. Fill in:
   - Name
   - Gateway: pick one (create per step 3 first if needed)
   - Hostname: your Windows VM's reachable host
   - Port: 3389
   - WinRM port: 5985 (only relevant if you set up rotation)
   - Do NOT set rotation account unless you want to test rotation
4. Accounts → New → attach to the resource, enter the Windows admin's username/password

Alternatively via the API: see `pam-account-service.ts` + `pam-resource-router.ts` for the exact shape.

### Step 3. Register a gateway

Still in the UI, under the project's Gateway section:
1. Create a new gateway and capture the enrollment token

Then on the machine where you want the gateway to run (can be localhost for dev):

```
cd /Users/berniegandin/Repos/cli
git checkout feat/pam-rdp-poc

# Build the Rust static library first (one-time after cargo changes)
go generate ./packages/pam/handlers/rdp/...

# Build the CLI with the new handler wired in
go build -o ./infisical-dev .

# Enroll + run the gateway
./infisical-dev gateway start \
  --token '<enrollment token>' \
  --domain http://localhost:80
```

Watch for "Gateway registered" log lines. The gateway now holds a short-lived access token and is waiting for PAM session routing.

### Step 4. Initiate a session

Through the UI:
1. Navigate to the Windows account
2. Click Access

Expected flow:
- Backend issues a WebSocket ticket
- Frontend opens WebSocket at `/api/v1/pam/accounts/<id>/web-access?ticket=...`
- Backend relays through the gateway tunnel with ALPN `infisical-pam-proxy`
- Gateway's `HandlePAMProxy` sees resourceType=rdp, dispatches to the new RDP handler
- Handler pulls creds, dups the connection fd, hands off to the Rust bridge
- Bridge terminates inbound TLS, connects to the Windows target, injects creds, bridges
- Browser gets the page we scaffolded (`PamWindowsRdpPage`)

### Current scaffold limitations you will hit in path B

The frontend scaffold at `frontend/src/pages/pam/PamAccountAccessPage/PamWindowsRdpPage.tsx` opens the WebSocket but **does not drive the RDP protocol yet**. The canvas will be blank. Browser rendering requires:

1. IronRDP WASM client vendored into the frontend (see `useRdpSession.ts` TODOs)
2. Backend web-access WebSocket bridge adjusted to carry raw bytes for RDP (currently wraps everything in a JSON envelope designed for xterm)

For now, path B only validates the **gateway + backend** half. To see a working desktop end-to-end you still have to use path A until the browser client is wired up (Phase 4).

## Debugging tips

**Gateway logs**: `infisical-dev gateway start ...` logs PAM session events as they land. Look for "Starting RDP PAM proxy" followed by "New RDP connection for PAM session".

**Rust bridge logs**: set `IRONRDP_LOG=info` or `debug` in the gateway's env to see the bridge's protocol-level logs.

**Session logs on disk**: the gateway writes per-session event logs under the session recording path (`/var/lib/infisical/session_recordings/` by default, configurable via `INFISICAL_PAM_SESSION_RECORDING_PATH`). RDP recordings are named `pam_session_<sessionId>_rdp_expires_<ts>.enc`.

**Backend session events**: query `GET /api/v1/pam/sessions/<id>/logs` to see the uploaded events.

**Common failure: target unreachable**
The gateway must have TCP access to your Windows VM on 3389. Check SG/firewall rules.

**Common failure: CredSSP rejects**
Likely a genuine wrong password, or the account is locked / has "password must change at next login" set. Check the Windows event log on the target.

**Common failure: "no bridge library" on fresh clones**
Run `go generate ./packages/pam/handlers/rdp/...` before `go build`. See `packages/pam/handlers/rdp/README.md`.

## What's proven vs not proven

- ✅ Path A: the protocol bridge + credential injection + event capture
- ✅ Path B up to the gateway: handler wired, dispatcher routes, creds pulled
- ⚠️ Path B browser rendering: scaffolded but not functional (see Phase 4 TODOs)
- ⚠️ Session recording persistence: should work via the existing uploader path; verify by inspecting `encryptedLogsBlob` / batch endpoints after a session
- ❌ Playback UI: Phase 5, nothing exists yet
