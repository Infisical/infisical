# PAM "Web Page" Target — Design Spec

Status: proposed
Date: 2026-07-10
Author: Calvin Lobo

## Goal

Add a new PAM target (account type) for an internal web page/app. A user, through
the Infisical web UI, reaches an internal web resource that lives on a remote
private network, interacts with it (navigate, click, type, submit forms, load
assets), and has the whole session recorded and replayable in a tamper-proof way.
No client-side install, VPN, browser extension, or CLI.

This is a take-home interview exercise, not a production feature. The priority is
a tractable, demoable vertical slice that actually runs end to end in the local
`docker-compose.dev.yml` stack (Postgres, Redis, backend, frontend) with the
gateway and relay already running locally. Where the demo cuts a corner, this
spec says so and names the production version.

Read `PAM_OVERVIEW.md` (repo root) and `backend/src/ee/services/pam/CLAUDE.md`
first. This spec assumes that context (session lifecycle, the chunk recording
model, envelope encryption, the WebSocket ticket, `getSessionCredentials`, the
two-tier permission model).

## Chosen approach — Remote Browser Isolation, pixel streaming

A real headless Chromium runs server-side, driven via Playwright. It reaches the
internal web resource through the existing gateway tunnel. The user's browser
shows a live JPEG stream on a `<canvas>` and sends mouse/keyboard back. The same
server-side stream is what gets recorded, which is what makes the recording
tamper-proof: the capture happens where the user cannot reach it.

The one fact that drives everything: the hard requirement is a tamper-proof,
"exactly what the user sees" recording. That can only be captured server-side.
With RBI-pixels the access mechanism and the recording mechanism are the same
server-side browser, so we expose the site and record it in one stroke.

### Rejected alternatives

- Authenticated reverse proxy (Teleport/Cloudflare Access model, internal site
  rendered in the user's own browser). Simplest way to expose the site, but
  recording drops to HTTP request/response logs, not the visual session, and any
  visual capture would be client-side, so not tamper-proof. Also needs URL
  rewriting / per-app subdomains to work with real apps.
- RBI DOM streaming (rrweb-style). Content still reaches the client, fidelity has
  gaps (canvas/video/cross-origin), and you would still need the pixel path's
  input channel. Strictly more work, weaker isolation. Worth noting as a possible
  future recording-format enhancement, not the path.
- Raw TCP tunnel / port-forward to the user. No meaningful recording story.

### Where this evolves (out of scope, named so the demo's limits are honest)

WebRTC/H.264 transport, platforms like neko/Kasm, a browser sidecar or
gateway-side browser, an HTTP-CONNECT gateway proxy for arbitrary hosts + TLS,
S3-backed recording, binary chunk framing, and a structured-event audit layer.
These are the production-grade version of this idea and are deliberately not
built here.

## Architecture — what is new vs reused

The feature rides the existing web-access WebSocket path end to end:
`issueWebSocketTicket` (permission check + single-use ticket) →
`handleWebSocketConnection` (decrypt creds, resolve gateway target, set up the
relay, invoke the handler) → a handler resolved from the `SESSION_HANDLERS` map.

Genuinely new code, and it is small:

- One new session handler, `pam-web-access/webpage/pam-webpage-session-handler.ts`,
  which drives Playwright + screencast instead of relaying raw TCP bytes.
- One new account type, `webpage`: an enum value plus an `ACCOUNT_TYPE_CONFIGS`
  entry. The create/edit form auto-renders from metadata, and registering the
  handler auto-flips `supportsWebAccess`.
- One new frontend replay view, `WebReplayView`, which draws timestamped JPEGs to
  a `<canvas>`. No WASM decoder (unlike RDP).
- One new frontend live view, a canvas that draws incoming JPEG frames and sends
  mouse/keyboard back, modeled on the RDP live session hook.

Reused as-is: the ticket/permission flow, the gateway relay setup
(`setupRelayServer`), the chunk table (`pam_session_event_chunks`) and its
AES-256-GCM encryption scheme, the client-side chunk decrypt, the session
lifecycle/expiry (BullMQ), and the two-tier permission model.

### The one deliberate divergence from the RDP precedent

In the RDP/SSH precedent the gateway does the recording: it encrypts frames with
the session key and uploads chunks to the backend via an upload-token'd HTTP POST
(`recordChunk`). The backend handler only relays bytes.

For the web target, Playwright runs inside the backend, so the backend already
holds both the JPEG frames and the KMS key. The backend handler therefore
encrypts and writes recording chunks itself, reusing the exact AES-256-GCM
scheme, session key, per-chunk IV, per-chunk AAD, chunk table, and frontend
decrypt contract. Only the writer moves, from gateway to backend. The gateway
upload-token path is not used for this account type; the gateway only tunnels
traffic to the target. This was a settled decision, not an accident of the demo:
routing the backend's own chunks back through a self-HTTP upload endpoint would
be pointless indirection.

## New account type + config

Add to `backend/src/ee/services/pam/pam-enums.ts` and mirror in
`frontend/src/hooks/api/pam/enums.ts` (the one shared string both sides need):

```ts
WebPage = "webpage"
```

Add a config entry to `ACCOUNT_TYPE_CONFIGS` in
`backend/src/ee/services/pam-account/pam-account-schemas.ts`:

```ts
[PamAccountType.WebPage]: {
  name: "Web Page",
  icon: "WebPage.png",
  connectionDetails: z.object({
    host: z.string().trim().min(1).max(255),      // internal host the gateway tunnels to
    port: z.coerce.number(),                        // its port
    useHttps: z.boolean(),                          // demo: false (plain HTTP target)
    startPath: z.string().trim().default("/")       // path to open on launch
  }),
  credentials: z.object({}),                        // no secret; app-level login out of scope
  sanitizedCredentials: z.object({}),
  ui: {
    port: { defaultValue: 80 },
    useHttps: { label: "Use HTTPS" }
  }
}
```

Then, per the account-type checklist in `pam/CLAUDE.md`:

1. Add a `WebPage` case to `extractGatewayTarget` returning `{ host, port }`.
2. Drop a `WebPage.png` icon into `frontend/public/images/integrations/`.
3. Register the handler in `SESSION_HANDLERS` (section below). That is what makes
   `GET /pam/accounts/types` report `supportsWebAccess: true` for the type and
   lets the frontend offer a Browser launch.

No form components, router schemas, or field renderers change — the create/edit
form is rendered from `GET /pam/accounts/types` metadata.

### The `credentialConfigured` wrinkle (must handle)

`getAccountAccessibilityIssues` raises `NoCredential` (which blocks launch) unless
`account.credentialConfigured` is true. Web page accounts have no credential
fields, so account create must treat a type with an empty `credentials` schema as
already configured (set `credentialConfigured = true` on create when the type has
no secret fields). Verify the exact create path in `pam-account-service.ts` and
make this explicit rather than relying on a user "setting" an empty credential.

### Recording config: no change needed

`accountTypeRequiresRecording` returns true only for Windows/WindowsAd — it means
"requires S3 recording config," and `enforceRecordingConfig` keys off it. `webpage`
is simply not added there, so the launch guard passes untouched. The web handler
records to Postgres-inline unconditionally (below), so no S3 config is required
for the demo. Do not modify `enforceRecordingConfig`.

## Access path — where Playwright runs and how it reaches the target

### Browser location (demo: backend container)

Playwright with its bundled Chromium runs in the backend container. The image adds
`npx playwright install --with-deps chromium`. One browser context per session.

This is the demo choice. Production evolution is a dedicated browser sidecar
service or a gateway-side browser (most faithful to "runs inside the private
network," but the gateway is Go, so heavy). The Chromium binary + system deps grow
the image and are a FIPS / image-size concern — a production-only concern, called
out here so it is not silently taken on.

### Reaching the target through the gateway

Reuse the relay that `handleWebSocketConnection` already sets up: `setupRelayServer`
opens `127.0.0.1:<relayPort>` and tunnels through the gateway (mTLS) to the target
host:port that `extractGatewayTarget` returned, using `GatewayProxyProtocol.Pam`
(the same protocol non-RDP web-access already uses). The handler points the
Playwright page at `http://127.0.0.1:<relayPort><startPath>`.

Caveat, documented for the demo: a bare TCP relay carries the wrong `Host` header
(the browser sends `Host: 127.0.0.1:<relayPort>`), and it is plain TCP, so vhost
routing and TLS to the target are not handled. A single cooperative internal HTTP
target works fine, which is all the demo needs. The production fix is an
HTTP-CONNECT proxy protocol on the gateway so the browser can reach many hosts and
terminate TLS at the target — named, not built.

## Session handler + WebSocket protocol

The handler conforms to the existing signature:

```ts
type TWebAccessHandler = (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
) => Promise<TSessionHandlerResult>;   // { cleanup: () => Promise<void> }
```

It has the same shape as the SSH/RDP handlers (`ctx` gives `socket`, `relayPort`,
`sessionId`, `sendMessage`, `sendSessionEnd`, `isNearSessionExpiry`, `onCleanup`,
`earlyMessages`, `releaseEarlyBuffer`).

Handler flow:

1. Launch a Chromium browser context (one per session), new page, viewport
   1280×720.
2. Point the page's traffic at the relay port and navigate to
   `http://127.0.0.1:<relayPort><startPath>`.
3. Generate recording secrets and start the recorder (see Recording).
4. Start screencast and begin streaming frames to the client; begin reading input
   messages from the client.
5. Return `{ cleanup }` that stops the screencast, flushes the final chunk, and
   closes the context.

### Playwright screencast API — confirm at implementation time

The intended API is `page.screencast.start({ onFrame, size })` (Playwright
≥ 1.59), where each `onFrame` yields a base64 JPEG, a timestamp, and the viewport
width/height. Playwright is not currently a backend dependency — it must be added
(subject to the repo's 7-day minimum-release-age `.npmrc` policy). If the bundled
Playwright version does not expose `page.screencast`, fall back to driving CDP
directly: `Page.startScreencast` / `Page.screencastFrame` (+ `screencastFrameAck`),
which is what the high-level API wraps. Input then uses `Input.dispatchMouseEvent`
/ `Input.dispatchKeyEvent`, or the `page.mouse` / `page.keyboard` helpers. This is
the one external-library assumption in the plan; verify it first.

### WebSocket protocol

Mirrors the RDP handler's binary-frame + `bufferedAmount` backpressure shape.

Server → client:
- Binary WS message = one JPEG frame with a small fixed-size header:
  `[ts: u32 LE][w: u16 LE][h: u16 LE][...jpeg bytes]`. The client reads the header,
  then draws the JPEG.
- JSON control messages reuse the existing terminal message types: `ready` on
  first paint, `session_end` with a `SessionEndReason`.

Client → server (JSON):
- `{ type: "mouse", x, y, button, action }` — action ∈ move | down | up | click.
- `{ type: "key", key, code, action }` — action ∈ down | up.
- `{ type: "scroll", x, y, dx, dy }`.
- `{ type: "navigate", url }` — gated: only allowed within the target origin;
  reject/log anything else (this is also a structured audit signal, see stretch).
- `{ type: "resize", w, h }` — resizes the Playwright viewport and screencast size.

Define these with a Zod discriminated union parsed via the existing
`parseClientMessage` helper, the same way SSH parses its client messages.

Backpressure: before sending a frame, check `socket.bufferedAmount >
WS_HIGH_WATER_MARK` (the RDP constant). If over, skip that frame rather than queue
it — screencast is lossy-by-nature and the next full frame supersedes it, so
dropping is correct and keeps memory bounded. Screencast frame-ack (CDP) or a
simple max-FPS cap prevents the browser from outrunning the socket.

## Recording format — backend-direct chunk write

Reuse the encryption spine, move the writer into the backend.

At session start:
- Call `generateSessionRecordingSecrets({ projectId, sessionId, kmsService })`.
  Store the KMS-wrapped key on `pam_sessions.encryptedSessionKey`. Keep the
  plaintext `sessionKey` in process memory only (used to encrypt chunks). The
  gateway upload token is not needed here; store its hash harmlessly or skip it.

Per chunk (roughly every ~2s of frames, or a size cap, whichever first):
- Accumulate frames into a JSON event array — matching the existing "plaintext is
  a JSON event array" contract the frontend decrypt already expects:

  ```json
  [ { "type": "web_frame", "elapsedMs": 1234, "jpegBase64": "...", "w": 1280, "h": 720 }, ... ]
  ```

- Encrypt the serialized array with AES-256-GCM: fresh 12-byte IV, key = session
  key, AAD = `SHA256(projectId | sessionId | chunkIndex | storageBackend | "v1")`.
  This AAD is exactly what the frontend recomputes in `decryptOneChunk`, so replay
  works with no frontend crypto change.
- Write via a new internal method on the recording service (e.g.
  `recordChunkInternal`) — or the chunk DAL's `insertIgnoreDuplicate` directly —
  with `chunkIndex`, `startElapsedMs`, `endElapsedMs`, `storageBackend: "postgres"`,
  `encryptedEventsBlob` (inline ciphertext), `ciphertextSha256`, `ciphertextBytes`,
  `iv`. This bypasses `recordChunk`'s gateway upload-token verification, which is
  correct because the writer is the trusted backend, not the gateway.

Storage backend (demo): Postgres-inline. `encryptedEventsBlob` holds the
ciphertext, `externalChunkObjectKey` stays null. No S3 in local docker. Production
uses the S3 backend the chunk pipeline already supports.

Keyframes: every JPEG is already a full frame, so `externalKeyframeObjectKey` stays
null. Seek just draws the latest frame with `elapsedMs ≤ target`.

Frame cadence and JPEG-in-JSON are deliberately simple. Base64 JPEG inside JSON
inside the encrypted blob is wasteful on bytes; it is chosen because it reuses the
event-array contract wholesale and needs zero new decode path on the client.
Binary chunk framing is the production optimization, noted not built.

## Replay view

`WebReplayView` modeled on `RdpReplayView`, but far simpler because there is no
WASM decoder:

- Reuse the existing playback query + client decrypt (`useDecryptedSessionLogs`,
  `decryptOneChunk`, `importSessionKeyFromBase64`) unchanged — same AES-GCM,
  same AAD, same SHA-256 integrity check. The browser gets the session key
  (base64) from the playback endpoint, which already hands it out to authorized
  viewers.
- Extend the playback event type to include the `web_frame` shape.
- Player: on each tick, find the latest `web_frame` with `elapsedMs ≤ currentMs`,
  decode its JPEG into an `Image`/`ImageBitmap`, and `ctx.drawImage(...)` to the
  canvas. Play/pause/seek/scrub reuse the RDP player's control surface.
- Add a `WebPage` case to the session-type dispatch in `SessionDetailSheet.tsx`
  (today it branches RDP-canvas vs text-log) so a web session renders
  `WebReplayView`.

## Live view (frontend)

Model on the RDP live session hook. Flow:

1. `POST /pam/accounts/{accountId}/web-access-ticket` → `{ ticket }` (JWT-only,
   permission-checked, single-use). This is unchanged.
2. Open the WebSocket to `/api/v1/pam/accounts/{accountId}/web-access?ticket=...`.
3. On a binary message, parse the frame header and draw the JPEG to a `<canvas>`.
   On `ready`, hide the spinner; on `session_end`, show the end reason.
4. Attach canvas mouse/keyboard/scroll listeners and send the JSON input messages
   above. A URL bar (optional) sends `navigate`.

No WASM, no custom decoder — this is the real simplicity win over RDP.

## Tamper-proofing argument

The design guarantees the recording cannot be altered or deleted by the user, and
here is why, point by point:

- Server-side capture. The frames are produced by the backend's Chromium and
  encrypted in the backend. The user's browser only ever receives pixels and sends
  input; it never touches the recording write path. There is nothing user-side to
  tamper with.
- KMS-wrapped session key the user never holds. Each session's recording is
  encrypted with a per-session AES-256 key stored only in KMS-wrapped form on the
  session row. The user cannot forge or re-encrypt a chunk because they never have
  the key at write time. At playback the key is handed to an authorized viewer to
  decrypt in memory only.
- Per-chunk integrity + binding. Every chunk carries a `ciphertextSha256` so
  corrupted or swapped bytes are detected without the key, and an AAD bound to
  `projectId | sessionId | chunkIndex`, so a chunk cannot be moved to another
  session or reordered without failing GCM authentication.
- No user-facing mutation path. There is no endpoint that lets a user edit or
  delete chunks. Reads go through the PAM permission model (`ViewSessions`).

Stated honestly: this is not end-to-end encryption. The backend is a trusted
decryptor (it holds the KMS key and mints the session key). The protection is
against storage compromise and against the user tampering with their own
recording, and it forces playback through the backend's authorization. That is the
right threat model for this feature.

## Session lifecycle & cleanup

One browser context per session. Tear it down on every exit path:

- Normal end (`session_end` / client quit), client disconnect/socket close,
  handler `cleanup`, and session expiry (the existing BullMQ expiration job fires
  `endSessionById`, which the web-access service's cleanup already hooks).
- Cleanup must: stop the screencast, flush and write the final partial chunk,
  `context.close()` (and close the browser if this handler owns it), and clear any
  frame timers. Use an idempotent `cleanedUp` flag like the RDP handler so double
  cleanup is safe.

Resource caps:
- Reuse the existing concurrent-web-session guard (max 5 active web sessions per
  user) so a user cannot spawn unbounded Chromium contexts.
- Cap frame rate (e.g. ≤ ~10 FPS for the demo) so one session cannot saturate CPU
  or the socket. Bound per-chunk size.
- Ensure a crashed/orphaned Chromium context is closed on handler error, not
  just on clean exit — wrap launch/navigate in try/finally that routes to cleanup.

## Auth

Web access stays JWT-only (a human), like the other launch/web-access paths. The
existing `issueWebSocketTicket` flow covers it: full permission check over HTTP
(`LaunchSessions`, plus a valid approval grant if the account is gated), then a
short-lived single-use `TOKEN_PAM_WS_TICKET` with the target bound in. No new auth
work; confirm the ticket path is reached for the new type (it is, since it is
account-type-agnostic).

## Error handling

- Navigation/launch failure: send `session_end` with a `SetupFailed` reason,
  run cleanup, close the socket. Log with `[sessionId=...]`.
- Relay connect failure: the existing relay error surface (`getRelayError`) already
  reports through the web-access service; treat like RDP's connect-timeout path.
- Screencast/CDP error mid-session: cleanup + `session_end`.
- Chunk write failure: log and continue streaming (do not kill the live session on
  a single recording write error); surface a broken-chunk marker at playback, which
  the existing decrypt path already models (`brokenChunks`).
- Slow client: drop frames via `bufferedAmount`, never buffer unboundedly.

## Demo-only vs production split (explicit)

Demo (built here):
- Backend-side Chromium.
- Single cooperative internal HTTP target via the plain-TCP `Pam` relay.
- Postgres-inline recording.
- JPEG-in-JSON chunks, JPEG-over-WS live frames.
- Pixels + replay only.

Production (named, not built):
- Browser sidecar or gateway-side isolation.
- HTTP-CONNECT gateway proxy for arbitrary hosts, with TLS to the target.
- S3-backed recording, binary chunk framing.
- WebRTC/H.264 transport.
- Structured-event audit layer (navigation, network, downloads, clipboard, input)
  as a tamper-proof-audit enhancement and the substrate for suspicious-activity
  detection.

## Structured events (stretch, optional)

CDP/Playwright can surface navigation, network requests, downloads, clipboard, and
input as structured events, cheap to record alongside the pixels. Scope this as an
optional layer emitted into the same chunk event array (extra event `type`s beside
`web_frame`), not core. Core is pixels + replay. If time allows, capturing
`navigate` and download events materially strengthens the audit story and the
replay timeline.

## Testing

- Unit (Vitest, `*.test.ts` next to source):
  - Chunk encryption round-trip: encrypt a `web_frame` array in the backend and
    decrypt it with the frontend decrypt logic's algorithm (AAD/IV/SHA-256/GCM) to
    prove the contract holds both ways.
  - The frame-header codec (`[ts][w][h]` pack/unpack).
  - The client-input-message Zod parser (valid/invalid/oversized).
  - `getAccountAccessibilityIssues` for `webpage`: no `NoRecordingConfig`, and
    `NoCredential` only when `credentialConfigured` is false.
- Manual E2E (the demo itself): local docker + gateway, create a `webpage` account
  pointing at an internal HTTP page, launch a browser session, navigate/click/type,
  end it, then replay it from the Sessions page and confirm the pixels match.
- Automated E2E is heavier because Playwright-in-backend needs a real target and
  browser; scope it as manual for the demo and note a headless self-hosted target
  as the production test fixture.

## Files touched (checklist)

Backend:
- `pam/pam-enums.ts` — add `WebPage`.
- `pam-account/pam-account-schemas.ts` — `ACCOUNT_TYPE_CONFIGS` entry,
  `extractGatewayTarget` case.
- `pam-account/pam-account-service.ts` — `credentialConfigured = true` for
  no-secret types on create.
- `pam-web-access/webpage/pam-webpage-session-handler.ts` — new handler.
- `pam-web-access/pam-session-handlers.ts` — register in `SESSION_HANDLERS`.
- `pam-session-recording/pam-recording-chunk-service.ts` — add `recordChunkInternal`
  (backend-direct write) or call the DAL from the handler.
- `backend/package.json` — add `playwright` (mind the `.npmrc` 7-day age policy).
- Backend Dockerfile(s) — `npx playwright install --with-deps chromium`.
- `backend/src/server/routes/index.ts` — DI wiring if the handler needs new deps.

Frontend:
- `hooks/api/pam/enums.ts` — mirror `WebPage`.
- `public/images/integrations/WebPage.png` — icon.
- `pages/pam/PamSessionsPage/components/WebReplayView/` — new replay view + player.
- `pages/pam/PamSessionsPage/components/SessionDetailSheet.tsx` — dispatch `WebPage`.
- `hooks/api/pam/session-playback/types.ts` — add `web_frame` event shape.
- A live web-session hook + canvas view under `pages/pam/PamAccountAccessPage/`,
  modeled on the RDP live hook.

Docs:
- Update `backend/src/ee/services/pam/CLAUDE.md` if any new shared helper is
  introduced (per its "source of truth" rule).

## Open items to confirm at implementation time

1. The Playwright `page.screencast` API / version, with the CDP
   `Page.startScreencast` fallback. This is the only external-library assumption.
2. The exact account-create path that sets `credentialConfigured` for a no-secret
   type.
3. Whether `recordChunkInternal` belongs on the recording service or the handler
   calls the DAL directly — decide during wiring.
