# Windows PAM RDP — POC Plan

## Goal

Prove the end-to-end architecture works: a user clicks Access on a Windows resource, sees a live Windows desktop in their browser, closes the session, then opens the session record and watches the replay render identically.

## Architecture

```
Browser (ironrdp-web)
   |  RDP over WebSocket (existing web-access ticket flow)
   v
Backend (WS ticket issuance + relay)
   |  mTLS over SSH reverse tunnel, ALPN: infisical-rdp-proxy
   v
Gateway (Go) --- CGo/FFI (handle-based) --> Rust bridge
                                                 |-- ironrdp-acceptor  (server role, browser side)
                                                 |-- event tap --> existing session logger
                                                 +-- ironrdp-connector (client role, target side)
                                                         |  credentials injected via CredSSP
                                                         v
                                                 Windows target :3389
```

Playback: decrypted events from `encryptedLogsBlob` -> custom WASM player (built from `ironrdp-graphics`) -> canvas.

## In scope

- Rust MITM bridge using `ironrdp-acceptor` + `ironrdp-connector`, exposed to Go via handle-based FFI
- Gateway handler routing the `infisical-rdp-proxy` ALPN to the Rust bridge
- Credential injection via CredSSP on the target-side connection, using the existing `/v1/pam/sessions/:id/credentials` endpoint
- Browser live client using `ironrdp-web`, connected through the existing web-access WebSocket ticket flow
- Session recording of decoded RDP events (keyboard, mouse, bitmap regions) stored in Postgres `encryptedLogsBlob`
- Custom WASM playback module built from `ironrdp-graphics`, reading events from `encryptedLogsBlob`
- Local-account authentication on one Windows target (Server 2019 or 2022)
- Linux amd64 gateway build only
- Narrow fork of IronRDP to expose `DecodedImage::apply_*` methods as public

## Out of scope

- Object storage (S3, MinIO, local filesystem)
- CLI native-client (mstsc / FreeRDP)
- Virtual channels: clipboard, drive, audio, printer, USB, smart card (all refused at Channel Join)
- Domain accounts, Kerberos, AD integration
- Typed error taxonomy and NTSTATUS translation
- Post-rotation credential retry
- Playback seek, scrubbing, variable speed, keystroke search, thumbnails
- Dynamic resolution, multi-monitor, fullscreen, Ctrl-Alt-Del UI, IME
- AI summaries for RDP sessions
- Audit log additions
- Observability: metrics, tracing, dashboards
- Cross-platform gateway builds (macOS, Windows, arm64, BSDs)
- Automated CI tests (manual validation only)
- Reconnection after network drop
- FIPS compliance
- Admin live-watch of in-progress sessions
- Feature flagging, license gating, beta program
- Upstream PR to IronRDP (maintain the fork)
- Performance / load testing
- Long sessions (capped to what fits in a Postgres blob)

## Assumed working (reused unchanged)

- Windows PAM resource CRUD, schema, WinRM-based rotation
- Project KMS encryption
- `PamSession` state machine, `encryptedLogsBlob`, web-access ticket flow
- Gateway-v2 mTLS+SSH tunnel and ALPN routing
- Existing session logger and 10-second batched uploader
- Existing session view permissions

## Implementation phases

### Phase 0 — IronRDP spike

Prove credential injection works before integrating with Infisical.

**Deliverable**: standalone Rust binary that accepts an RDP connection on localhost, opens a new RDP connection to a hardcoded Windows target, injects hardcoded credentials via CredSSP, and forwards bytes.

**Exit gate**: `xfreerdp`, `mstsc`, and `ironrdp-web` all connect through the bridge and see a logged-in Windows desktop without being prompted for credentials.

### Phase 1 — Rust bridge with FFI surface

Wrap the working bridge in a handle-based C ABI.

**Deliverable**:
- Rust crate with `crate-type = ["staticlib"]`, compiling to a static library
- Handle-based API: create, feed-in, read-out, poll-events, close
- Event tap emitting three types: `KeyboardInput`, `MouseInput`, `BitmapRegion`
- Go CGo wrapper exposing an idiomatic interface
- Build integration invoking `cargo build` before the Go build

**Exit gate**: a Go test program drives the bridge end-to-end against the same test Windows target, with events polled out via the FFI.

### Phase 2 — Gateway handler

Wire the bridge into the gateway's connection dispatcher.

**Deliverable**:
- New handler package alongside the existing SSH, Postgres, etc. handlers
- `infisical-rdp-proxy` ALPN registered and routed
- Credentials fetched from backend via existing endpoint
- Events piped into the existing session logger and uploader

**Exit gate**: a test RDP client connects through a real Infisical gateway to the Windows target; session events appear in the session log file on disk and are uploaded to the backend.

### Phase 3 — Backend glue

Minimal changes for the backend to recognize Windows sessions and serve recorded events for playback.

**Deliverable**:
- `WindowsServer` resource type handled in the web-access service (WS ticket issuance)
- New endpoint `GET /v1/pam/sessions/:id/events` that decrypts and streams the event log
- No new database tables (reuse `encryptedLogsBlob`)

**Exit gate**: backend correctly issues a WS ticket for a Windows session, session lifecycle transitions correctly, recorded events can be fetched via the new endpoint with the existing permission model.

### Phase 4 — Browser live client

**Deliverable**:
- `ironrdp-web` built from source (or vendored artifacts) integrated into the frontend
- Conditional branch in `PamAccountAccessPage` for `resourceType === WindowsServer`
- Canvas mounted at a fixed 1920x1080 resolution
- WebSocket connected via the existing ticket flow
- Keyboard + mouse input wired to the WASM

**Exit gate**: clicking Access on a Windows resource in the Infisical UI opens a live Windows desktop in the browser; keyboard and mouse work; closing the tab ends the session.

### Phase 5 — Playback

**Deliverable**:
- Fork of IronRDP with `DecodedImage::apply_*` exposed as `pub`, consumed as a git dependency
- New WASM crate that compiles via `wasm-pack`, depends on `ironrdp-graphics` + `ironrdp-pdu` + forked `ironrdp-session`
- JS-facing API: construct player with canvas, feed events, reset
- Frontend playback component on the session detail page
- Event-stream parser that walks the decrypted event log and dispatches to the player
- Minimal controls: play, pause, restart (no seek, no speed control)

**Exit gate**: opening a completed session's detail page and clicking play renders the session identically to the original, from start to finish.

### Phase 6 — Integration polish

**Deliverable**:
- Documented test flow against the test Windows VM
- Top crash / hang bugs fixed
- Short demo of the end-to-end success criterion

## Open decisions before starting

- **Test Windows target**: who provisions the VM, where it lives, how the team accesses it
- **Fork location**: GitHub org for the IronRDP fork (`infisical/IronRDP` or similar)
- **WASM player source tree**: separate crate in the frontend repo, or standalone repo
- **Build integration**: Cargo invoked from the Go build step, or Cargo workspace pattern (pick whichever matches existing CLI repo conventions)

## Risks

- **IronRDP acceptor negotiation with `ironrdp-web`**: Phase 0 should include the browser client specifically, not just mstsc / FreeRDP, to catch any mismatch early.
- **Fork drift**: if IronRDP releases a new version touching the `DecodedImage` module during the POC, we merge. Low probability over the POC window but non-zero.
- **Session log size**: long sessions will blow past Postgres blob practical limits. Cap POC sessions to short durations; document that production needs object storage.
- **WASM build integration with Vite**: well-trodden but occasionally brittle; budget a day for pipeline glue.
- **Real Windows target quirks**: stick to a vanilla Server 2019 / 2022 configuration to avoid security policies (restricted admin, FIPS-enforced ciphers) that could reject our CredSSP handshake.

## Success criterion

A user clicks Access on a Windows resource, sees a live Windows desktop in the browser, closes the session, opens the session record, and watches the replay render identically.

If that flow works end-to-end on a test Windows VM with local account credentials, the POC has validated the architecture.
