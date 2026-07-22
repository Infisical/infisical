# PAM Web Access — Design Notes

Superday feature: let a user reach an **internal web app** from a browser with nothing
installed (no VPN, no client), browse it as if on the private network, while Infisical
records the session tamper-proofly and lets it be replayed.

This adds a new PAM account type, **Web**, alongside the existing SSH / Postgres / RDP / etc.

## The problem, in four parts

| Sub-problem | Answer |
|---|---|
| **Reach** the internal app with no inbound ports / no client | Reuse the existing relay → gateway outbound tunnel |
| **Present** it in the browser | Run a headless Chromium next to the gateway; stream its screen |
| **Capture** what happened, tamper-proofly | The **gateway** records; reuse the existing encrypted chunk pipeline |
| **Replay** | Reuse the existing playback pipeline; add a frame player + event log |

## Approaches considered

**Option A — HTTP reverse proxy.** Proxy each request/response through the tunnel; the
user's own browser renders the HTML. Cheap, but naive proxying breaks on SPAs (client-side
routing, absolute URLs, websockets) and the "recording" is only an HTTP transaction log —
weak for an admin trying to see what actually happened.

**Option B — remote browser / pixel streaming (chosen).** Run Chromium *inside* the private
network (next to the gateway); stream its rendered screen to the user as image frames and
send the user's input back. Any app works because a real browser renders it, and the
recording is literally what the user saw.

**Decision (with Maidul at the whiteboard): build a hybrid.** A web session produces **both**
a request/response **event log** (Option A's fidelity — quick to scan) **and** a **video-style
replay** (Option B's fidelity — watch what happened). Both are captured at the gateway from
the same Chrome DevTools Protocol (CDP) stream: screencast frames + network events.

### Why the camera lives in the data plane

The recording must be produced somewhere the end user cannot touch. Running the recorder in
the control plane would be "a camera outside the warehouse you are trying to monitor." So the
**gateway** (operator-controlled, inside the private network) drives Chromium and emits the
recording events. The user's browser only ever *receives* frames — it never writes the
recording. That, plus per-chunk AES-256-GCM encryption, KMS-wrapped session keys, and
**append-only** chunk storage, is what makes the recording tamper-proof.

## How it works

```
 user browser ─WS─▶ Infisical backend ─TLS─▶ Relay ─▶ Gateway ─CDP─▶ Chromium ─HTTP─▶ internal app
      ▲  live frames (JPEG)                                │  (in the private network)
      └──── input (click / type / navigate) ──────────────┘
                                                           └─ records: screencast frames +
                                                              network events → existing
                                                              encrypted, append-only chunk
                                                              pipeline (Postgres or S3)
```

- **Reach/tunnel:** unchanged. The Web type rides the existing `Pam` gateway protocol; the
  backend hands the session handler a loopback TCP port that transparently bridges to the
  gateway through the relay.
- **Gateway (Go):** a new `web` resource type + handler drives Chromium over CDP —
  `Page.navigate` to the target, `Page.startScreencast` for frames, `Network.*` events for
  the log, and `Input.*` for user actions. It tees frames + network events into the shared
  `SessionLogger`, so the entire downstream (chunking, encryption, upload, playback API,
  client-side decryption) is reused **unchanged**.
- **Backend (TypeScript):** a thin WebSocket ↔ TCP byte pump (mirrors the RDP handler) — it
  does not understand the payload; the browser and gateway speak a small JSON framing through
  it. A `Web` entry in `ACCOUNT_TYPE_CONFIGS` (schema-driven, so the create form
  auto-renders) plus a default account template.
- **Frontend (React):** a live view (`<canvas>` fed by JPEG frames + click-to-navigate) and a
  replay view (frame player on an elapsed-time timeline) beside the reused HTTP event-log
  renderer.

## What is scoped for the prototype vs. production

Deliberately in scope (demonstrated working): reach, live view, capture, video replay,
tamper-proof storage in local Postgres.

Scoped out (called out, not built):
- **Per-session Chromium lifecycle at scale** — the prototype uses one shared, hand-started
  Chromium. Production needs per-session browser sidecars: spawn, sandbox, resource caps,
  teardown, crash recovery. This is the real engineering lift and its own project.
- **Input fidelity** — v1 is click-to-navigate + basic typing. No scroll / modifier keys /
  clipboard / resize.
- **Cursor on replay** — Chrome's screencast captures page pixels, not the OS cursor. A
  cursor overlay (synthesized from click coordinates) would restore it.
- **Storage at scale** — chunks go to Postgres locally; S3 is supported by the existing
  pipeline but needs an AWS connection.
- **Stronger tamper-evidence** — append-only already prevents overwrite; a hash-chain across
  chunks (each hashing the previous) would make any gap independently detectable.

## Files touched

**infisical** (backend + frontend):
- `backend/src/ee/services/pam/pam-enums.ts` — `Web` account type
- `backend/src/ee/services/pam-account/pam-account-schemas.ts` — `Web` config, gateway target
  (co-located Chromium CDP endpoint), connection-detail pass-through
- `backend/src/ee/services/pam-web-access/pam-session-handlers.ts` +
  `.../web/pam-web-session-handler.ts` — byte-pump session handler
- `backend/src/ee/services/pam-project/pam-project-bootstrap.ts` — default `web` template
- `frontend/src/hooks/api/pam/enums.ts` — `Web` type + `cdp-frame` channel
- `frontend/src/pages/pam/PamAccountAccessPage/` — `WebBrowserContent` + `useWebBrowserSession`
  (live view)
- `frontend/src/pages/pam/PamSessionsPage/components/WebReplayView/` — frame player; wired into
  `SessionDetailSheet` (recording + logs tabs)

**cli** (Go gateway):
- `packages/pam/handlers/web/proxy.go` — CDP driver + recording tee (the core new code)
- `packages/pam/pam-proxy.go`, `packages/pam/session/{uploader,credentials}.go`,
  `packages/api/model.go` — wire the `web` resource type + `targetUrl` through

## Running it locally

1. Internal app: `docker run -d --name demo-internal-app -p 8090:8080 mccutchen/go-httpbin`
2. Browser: `docker run -d --name demo-chromium --add-host=host.docker.internal:host-gateway -p 9222:9222 chromedp/headless-shell:latest --remote-allow-origins=*`
   (the `--remote-allow-origins=*` flag is required — Chromium rejects CDP WebSocket
   connections that carry an `Origin` header without it.)
3. Enroll a relay + gateway (gateway with `--pam-session-recording-path`), start Infisical.
4. PAM → Add Account → **Web App** template → Target URL `http://host.docker.internal:8090`
   → gateway → Create → My Access → Launch session.

## Note on the environment

Built and tested on Windows + Docker Desktop. Several setup quirks were specific to that
combination (slow bind-mount boot, HMR/nodemon not reliably picking up changes) rather than
the feature — worked around and documented for the next candidate.
