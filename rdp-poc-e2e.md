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

### Architecture for the browser flow

Both CLI and browser flows converge inside the gateway into the same
MITM + credential-injection + event-tap pipeline. The difference is
how the gateway gets to that point:

- **CLI**: mstsc speaks raw RDP (TPKT starts with 0x03). Gateway acts as
  an RDP server, does its own X.224 + TLS, moves to active phase.
- **Browser**: the vendored IronRDP WASM client speaks RDCleanPath
  (ASN.1 SEQUENCE starts with 0x30). Gateway parses the Request, does
  the target-side X.224 + TLS itself, sends the Response with cert
  chain, then enters the same active-phase logic.

The backend (pam-windows-rdp-session-handler) is a thin WebSocket ↔
gateway-tunnel byte-pump for both flows. No protocol parsing on the
backend. All RDP protocol work stays in one place (Rust bridge), which
keeps session recording and credential injection centralized.

### Current status of the browser flow

Implemented:
- Frontend: vendored ironrdp-web WASM + useRdpSession hook + Windows
  dispatch on the access page.
- Backend: Windows session handler that byte-pumps.
- Gateway: auto-detects RDCleanPath vs raw RDP on first byte. For
  RDCleanPath it parses the Request, opens the target, does X.224 +
  TLS, sends the Response.

Not implemented yet (blocks end-to-end browser rendering):
- Post-RDCleanPath active-phase bridge in the gateway. After the
  Response is sent, the session needs:
  1. An acceptor-like state machine on the client side already past
     X.224 + TLS (RDCleanPath did both), ready for the client's
     CredSSP + Basic Settings Exchange.
  2. A connector state on the target side already past TLS (we just
     did it), ready to do CredSSP with vaulted credentials.
  3. The existing event-tap bridge loop once both sides hit active.
  IronRDP's Acceptor doesn't expose a "start from post-TLS" entry
  point, so this needs either a narrow fork or a custom state machine
  built from the lower-level primitives.

- Frontend credential placeholder: once the active-phase bridge lands,
  the browser's SessionBuilder just needs to use fixed placeholder
  credentials (e.g., "infisical"/"infisical"). The gateway substitutes
  them with vaulted credentials during its target-side CredSSP. The
  browser never sees real creds, matching the CLI flow's security
  story.

For now, path B validates everything up through the RDCleanPath
handshake completing successfully (Rust bridge logs "Response sent,
handshake complete"). The session then fails cleanly because the
active-phase bridge isn't wired. Use path A for a full working
session today.

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

- ✅ Path A: protocol bridge + credential injection + event capture + FreeRDP rendering
- ✅ Path B, CLI-reaching-gateway portion: handler wired, dispatcher routes, creds pulled
- ✅ Path B, browser RDCleanPath handshake: Request parsed, X.224 + TLS to target, Response sent
- ❌ Path B, browser active phase: missing (post-TLS acceptor hand-off + CredSSP bridge)
- ⚠️ Session recording persistence: should work via existing uploader; verify with `encryptedLogsBlob` after a completed CLI session
- ❌ Playback UI: Phase 5, nothing exists yet

## What's left to see a Windows desktop in a browser

One concrete block of work: the **post-RDCleanPath active-phase bridge**
inside the Rust gateway (see rdcleanpath.rs TODO). Once that lands,
the frontend just needs placeholder credentials on SessionBuilder and
the existing recording pipeline carries RDP events from browser sessions
as well. No backend, frontend, or architecture changes expected past
that point.
