# PAM Web Page Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PAM `webpage` account type that reaches an internal web page through a server-side Playwright/Chromium browser, streams pixels to the user's browser, and records the session tamper-proof.

**Architecture:** A headless Chromium runs in the backend, driven by Playwright, reaching the target through the existing gateway relay. It rides the existing web-access WebSocket path (`issueWebSocketTicket` → `handleWebSocketConnection` → a `SESSION_HANDLERS` entry). The new handler streams JPEG frames to the browser over the WebSocket and, unlike the gateway-driven RDP path, encrypts and writes recording chunks itself (it holds the frames and the KMS key). Replay reuses the existing client-side chunk decrypt, drawing JPEGs to a canvas.

**Tech Stack:** TypeScript, Fastify, Playwright (new backend dep), Node `crypto` (AES-256-GCM), React 18, Vitest.

## Global Constraints

- Playwright must be added to `backend/package.json`. The repo enforces a **7-day minimum release age** for npm packages (`.npmrc`), so `npm install` resolves only versions published ≥ 7 days ago.
- Backend logs must carry identifiers in the message string as `[key=value]` (e.g. `[sessionId=...]`).
- Recording chunk encryption must match the frontend decrypt contract exactly: AES-256-GCM, 12-byte IV, body = `ciphertext || 16-byte GCM auth tag`, AAD = `SHA256("${projectId}|${sessionId}|${chunkIndex}|${storageBackend}|v1")`. The shared version constant is `PAM_RECORDING_AAD_VERSION = "v1"` in `backend/src/ee/services/pam-session-recording/pam-recording-constants.ts`.
- Web access is JWT-only (human actor). Do not add IDENTITY_ACCESS_TOKEN to launch/web-access paths.
- Follow the account-type checklist in `backend/src/ee/services/pam/CLAUDE.md`. Any new shared PAM helper must be documented there.
- Demo scope: single cooperative internal HTTP target, Postgres-inline recording, JPEG-in-JSON chunks. Do not build S3/WebRTC/sidecar paths — they are named in the spec as production evolution only.
- Spec: `docs/superpowers/specs/2026-07-10-pam-web-target-design.md`.

---

## File Structure

Backend:
- `backend/src/ee/services/pam/pam-enums.ts` — add `WebPage = "webpage"`.
- `backend/src/ee/services/pam-account/pam-account-schemas.ts` — `ACCOUNT_TYPE_CONFIGS[WebPage]` entry + `extractGatewayTarget` case.
- `backend/src/ee/services/pam-account/pam-account-service.ts` — set `credentialConfigured = true` for no-secret types on create.
- `backend/src/ee/services/pam-web-access/webpage/pam-webpage-session-handler.ts` — new session handler (Playwright + screencast + input + recording).
- `backend/src/ee/services/pam-web-access/webpage/pam-webpage-frame-codec.ts` — frame header pack/unpack + input message schema.
- `backend/src/ee/services/pam-web-access/pam-session-handlers.ts` — register `WebPage` in `SESSION_HANDLERS`.
- `backend/src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.ts` — backend AES-GCM chunk encrypt helper.
- `backend/src/ee/services/pam-session-recording/pam-recording-chunk-service.ts` — add `recordChunkInternal` (backend-direct write, no gateway token).
- `backend/package.json` + backend Dockerfiles — Playwright dep + Chromium install.

Frontend:
- `frontend/src/hooks/api/pam/enums.ts` — mirror `WebPage`.
- `frontend/public/images/integrations/WebPage.png` — icon.
- `frontend/src/hooks/api/pam/session-playback/types.ts` — add `web_frame` event type.
- `frontend/src/pages/pam/PamSessionsPage/components/WebReplayView/WebReplayView.tsx` + `webReplayPlayer.ts` — replay view + player.
- `frontend/src/pages/pam/PamSessionsPage/components/SessionDetailSheet.tsx` — dispatch `WebPage` to `WebReplayView`.
- `frontend/src/pages/pam/PamAccountAccessPage/useWebPageSession.ts` + a canvas view — live session.

---

## Task 1: Add the `webpage` account type (backend)

**Files:**
- Modify: `backend/src/ee/services/pam/pam-enums.ts`
- Modify: `backend/src/ee/services/pam-account/pam-account-schemas.ts`
- Test: `backend/src/ee/services/pam-account/pam-account-schemas.test.ts`

**Interfaces:**
- Produces: `PamAccountType.WebPage = "webpage"`; `ACCOUNT_TYPE_CONFIGS[PamAccountType.WebPage]` with `connectionDetails = { host, port, useHttps, startPath }` and empty `credentials`; `extractGatewayTarget(WebPage, details) → { host, port }`.

- [ ] **Step 1: Write the failing test**

Append to `pam-account-schemas.test.ts`:

```ts
import { extractGatewayTarget } from "./pam-account-schemas";
import { PamAccountType } from "../pam/pam-enums";

describe("webpage account type", () => {
  test("extractGatewayTarget returns host/port for webpage", async () => {
    const target = await extractGatewayTarget(PamAccountType.WebPage, {
      host: "intranet.local",
      port: 8080,
      useHttps: false,
      startPath: "/"
    });
    expect(target).toEqual({ host: "intranet.local", port: 8080 });
  });

  test("webpage has no NoRecordingConfig issue and no NoCredential when configured", () => {
    const issues = getAccountAccessibilityIssues({
      accountType: PamAccountType.WebPage,
      gatewayId: "gw-1",
      templateRecordingConnectionId: null,
      templateSettings: {},
      credentialConfigured: true
    });
    expect(issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/ee/services/pam-account/pam-account-schemas.test.ts -t webpage`
Expected: FAIL — `PamAccountType.WebPage` is undefined.

- [ ] **Step 3: Add the enum value**

In `pam/pam-enums.ts`, add to `PamAccountType`:

```ts
  WebPage = "webpage"
```

- [ ] **Step 4: Add the config entry**

In `pam-account-schemas.ts`, add to `ACCOUNT_TYPE_CONFIGS`:

```ts
  [PamAccountType.WebPage]: {
    name: "Web Page",
    icon: "WebPage.png",
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number(),
      useHttps: z.boolean(),
      startPath: z.string().trim().default("/")
    }),
    credentials: z.object({}),
    sanitizedCredentials: z.object({}),
    ui: {
      port: { defaultValue: 80 },
      useHttps: { label: "Use HTTPS" }
    }
  },
```

- [ ] **Step 5: Add the `extractGatewayTarget` case**

Find the `extractGatewayTarget` switch in `pam-account-schemas.ts` and add:

```ts
    case PamAccountType.WebPage: {
      const details = ACCOUNT_TYPE_CONFIGS[PamAccountType.WebPage].connectionDetails.parse(rawConnectionDetails);
      return { host: details.host, port: details.port };
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/ee/services/pam-account/pam-account-schemas.test.ts -t webpage`
Expected: PASS (both tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/ee/services/pam/pam-enums.ts backend/src/ee/services/pam-account/pam-account-schemas.ts backend/src/ee/services/pam-account/pam-account-schemas.test.ts
git commit -m "feat(pam): add webpage account type and gateway target"
```

---

## Task 2: Configure `credentialConfigured` for no-secret account types

**Files:**
- Modify: `backend/src/ee/services/pam-account/pam-account-service.ts`
- Test: `backend/src/ee/services/pam-account/pam-account-schemas.test.ts` (helper) or a service-level assertion

**Interfaces:**
- Consumes: `ACCOUNT_TYPE_CONFIGS[type].credentials`.
- Produces: on account create, `credentialConfigured` is `true` when the type's `credentials` schema has no fields.

**Background:** `getAccountAccessibilityIssues` raises `NoCredential` (blocking launch) unless `credentialConfigured` is true. A webpage account has no credential fields, so create must mark it configured.

- [ ] **Step 1: Write a failing unit test for the predicate**

Add a small exported helper `accountTypeHasNoCredentials` to `pam-account-schemas.ts` and test it in `pam-account-schemas.test.ts`:

```ts
import { accountTypeHasNoCredentials } from "./pam-account-schemas";

test("accountTypeHasNoCredentials is true for webpage, false for postgres", () => {
  expect(accountTypeHasNoCredentials(PamAccountType.WebPage)).toBe(true);
  expect(accountTypeHasNoCredentials(PamAccountType.Postgres)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/ee/services/pam-account/pam-account-schemas.test.ts -t accountTypeHasNoCredentials`
Expected: FAIL — helper not defined.

- [ ] **Step 3: Implement the helper**

In `pam-account-schemas.ts`:

```ts
export const accountTypeHasNoCredentials = (accountType: PamAccountType): boolean => {
  const schema = ACCOUNT_TYPE_CONFIGS[accountType as TSupportedAccountType]?.credentials;
  const parsed = schema?.safeParse({});
  return Boolean(parsed?.success) && Object.keys((parsed as { data: object }).data).length === 0;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/ee/services/pam-account/pam-account-schemas.test.ts -t accountTypeHasNoCredentials`
Expected: PASS.

- [ ] **Step 5: Use it in account create**

In `pam-account-service.ts`, find where an account is created and `credentialConfigured` is set (search for `credentialConfigured`). Set it to `true` when the type has no credential fields:

```ts
credentialConfigured: accountTypeHasNoCredentials(accountType) ? true : Boolean(credentials && Object.keys(credentials).length > 0),
```

(Adapt to the existing expression — the key change is: no-credential types are always configured.)

- [ ] **Step 6: Verify build + lint**

Run: `cd backend && npm run type:check 2>&1 | tail -5`
Expected: no new errors in these files.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ee/services/pam-account/pam-account-schemas.ts backend/src/ee/services/pam-account/pam-account-schemas.test.ts backend/src/ee/services/pam-account/pam-account-service.ts
git commit -m "feat(pam): mark no-credential account types as configured on create"
```

---

## Task 3: Backend chunk encryptor (AES-256-GCM, frontend-decrypt-compatible)

**Files:**
- Create: `backend/src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.ts`
- Test: `backend/src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.test.ts`

**Interfaces:**
- Produces: `encryptChunk({ plaintext: Buffer, sessionKey: Buffer, projectId, sessionId, chunkIndex, storageBackend }) → { body: Buffer, iv: Buffer, ciphertextSha256: Buffer }` where `body = ciphertext || authTag(16)`, decryptable by WebCrypto AES-GCM with `additionalData = SHA256("${projectId}|${sessionId}|${chunkIndex}|${storageBackend}|v1")`.

- [ ] **Step 1: Write the failing round-trip test**

```ts
import { webcrypto } from "node:crypto";
import { encryptChunk, buildChunkAad } from "./pam-recording-chunk-encryptor";

test("encryptChunk output decrypts with WebCrypto AES-GCM using the same AAD", async () => {
  const sessionKey = Buffer.alloc(32, 7);
  const plaintext = Buffer.from(JSON.stringify([{ type: "web_frame", elapsedMs: 10, jpegBase64: "AAA=", w: 4, h: 3 }]));
  const { body, iv } = encryptChunk({
    plaintext, sessionKey, projectId: "p1", sessionId: "s1", chunkIndex: 0, storageBackend: "postgres"
  });

  const key = await webcrypto.subtle.importKey("raw", sessionKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const aad = buildChunkAad({ projectId: "p1", sessionId: "s1", chunkIndex: 0, storageBackend: "postgres" });
  const out = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, body);
  expect(Buffer.from(out).toString()).toBe(plaintext.toString());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the encryptor**

```ts
import { crypto } from "@app/lib/crypto/cryptography";

import { PAM_RECORDING_AAD_VERSION } from "./pam-recording-constants";

type TChunkAadInput = { projectId: string; sessionId: string; chunkIndex: number; storageBackend: string };

export const buildChunkAad = ({ projectId, sessionId, chunkIndex, storageBackend }: TChunkAadInput): Buffer =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(`${projectId}|${sessionId}|${chunkIndex}|${storageBackend}|${PAM_RECORDING_AAD_VERSION}`)
    .digest();

export const encryptChunk = ({
  plaintext,
  sessionKey,
  projectId,
  sessionId,
  chunkIndex,
  storageBackend
}: { plaintext: Buffer; sessionKey: Buffer } & TChunkAadInput) => {
  const iv = crypto.nativeCrypto.randomBytes(12);
  const aad = buildChunkAad({ projectId, sessionId, chunkIndex, storageBackend });
  const cipher = crypto.nativeCrypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  const body = Buffer.concat([ciphertext, authTag]);
  const ciphertextSha256 = crypto.nativeCrypto.createHash("sha256").update(body).digest();
  return { body, iv, ciphertextSha256 };
};
```

Note: confirm `crypto.nativeCrypto` is the accessor used in `pam-recording-secrets.ts` (it is). If the crypto import path differs, mirror `pam-recording-secrets.ts`'s import exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.test.ts`
Expected: PASS — proves the backend ciphertext is byte-compatible with the browser decrypt path.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.ts backend/src/ee/services/pam-session-recording/pam-recording-chunk-encryptor.test.ts
git commit -m "feat(pam): backend AES-GCM chunk encryptor matching client decrypt"
```

---

## Task 4: `recordChunkInternal` — backend-direct chunk write

**Files:**
- Modify: `backend/src/ee/services/pam-session-recording/pam-recording-chunk-service.ts`
- Test: covered by Task 3 (encryptor) + manual E2E; add a thin unit test if the service can be constructed with a mock DAL.

**Interfaces:**
- Consumes: `encryptChunk` (Task 3), `pamSessionEventChunkDAL.insertIgnoreDuplicate`.
- Produces: `recordChunkInternal({ sessionId, projectId, chunkIndex, startElapsedMs, endElapsedMs, plaintext: Buffer, sessionKey: Buffer }) → { ok: true }`. Writes Postgres-inline only. No gateway upload token verification (trusted backend writer).

- [ ] **Step 1: Add the method**

Inside `pamRecordingChunkServiceFactory`, alongside `recordChunk`:

```ts
  const recordChunkInternal = async ({
    sessionId,
    projectId,
    chunkIndex,
    startElapsedMs,
    endElapsedMs,
    plaintext,
    sessionKey
  }: {
    sessionId: string;
    projectId: string;
    chunkIndex: number;
    startElapsedMs: number;
    endElapsedMs: number;
    plaintext: Buffer;
    sessionKey: Buffer;
  }) => {
    const storageBackend = PamRecordingStorageBackend.Postgres;
    const { body, iv, ciphertextSha256 } = encryptChunk({
      plaintext,
      sessionKey,
      projectId,
      sessionId,
      chunkIndex,
      storageBackend
    });
    if (body.length > PAM_RECORDING_MAX_CHUNK_BYTES) {
      throw new BadRequestError({ message: `Chunk too large [bytes=${body.length}]` });
    }
    await pamSessionEventChunkDAL.insertIgnoreDuplicate({
      sessionId,
      chunkIndex,
      startElapsedMs,
      endElapsedMs,
      storageBackend,
      encryptedEventsBlob: body,
      externalChunkObjectKey: null,
      chunkSizeBytes: null,
      externalKeyframeObjectKey: null,
      keyframeSizeBytes: null,
      ciphertextSha256,
      ciphertextBytes: body.length,
      iv
    });
    return { ok: true as const };
  };
```

- [ ] **Step 2: Import the encryptor and export the method**

At the top of the file add `import { encryptChunk } from "./pam-recording-chunk-encryptor";`. Add `recordChunkInternal` to the returned object:

```ts
  return { requestPresignedPut, recordChunk, recordChunkInternal, getSessionPlayback, getChunkCiphertext };
```

- [ ] **Step 3: Verify type check**

Run: `cd backend && npm run type:check 2>&1 | tail -5`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ee/services/pam-session-recording/pam-recording-chunk-service.ts
git commit -m "feat(pam): recordChunkInternal for backend-direct recording writes"
```

---

## Task 5: Add Playwright dependency + Chromium in the image

**Files:**
- Modify: `backend/package.json`
- Modify: `Dockerfile.standalone-infisical` (and note `Dockerfile.fips.standalone-infisical` is intentionally out of scope for the demo — Chromium is not FIPS-clean).

**Interfaces:**
- Produces: `playwright` importable in the backend; Chromium available at runtime.

- [ ] **Step 1: Install Playwright (respects the 7-day age policy)**

Run: `cd backend && npm install playwright`
Expected: resolves a version ≥ 7 days old; `package.json` + `package-lock.json` updated.

- [ ] **Step 2: Verify the screencast API exists**

Run: `cd backend && node -e "const {chromium}=require('playwright'); console.log(typeof chromium.launch)"`
Expected: prints `function`.

Then confirm `page.screencast` is present on the installed version:

Run: `cd backend && node -e "const pw=require('playwright/package.json'); console.log('playwright', pw.version)"`
Expected: prints the version. If `page.screencast` is NOT available on this version (test in Task 6 Step 2), the handler must use the CDP fallback (`Page.startScreencast` via `context.newCDPSession(page)`), documented in Task 6.

- [ ] **Step 3: Add the Chromium install to the standalone image**

In `Dockerfile.standalone-infisical`, after backend deps are installed, add:

```dockerfile
RUN cd backend && npx playwright install --with-deps chromium
```

Place it so the browser lands in the final runtime stage. Confirm the base image allows `--with-deps` (Debian/Ubuntu). If the base is Alpine, use `npx playwright install chromium` plus the Alpine chromium system packages, or document that the demo runs via `npm run dev` outside the image (the local dev target, which is what the demo uses).

- [ ] **Step 4: Verify local availability for the demo**

Run: `cd backend && npx playwright install chromium`
Expected: Chromium downloaded for the local dev run.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json Dockerfile.standalone-infisical
git commit -m "build(pam): add Playwright + Chromium for web page target"
```

---

## Task 6: The webpage session handler

**Files:**
- Create: `backend/src/ee/services/pam-web-access/webpage/pam-webpage-frame-codec.ts`
- Create: `backend/src/ee/services/pam-web-access/webpage/pam-webpage-session-handler.ts`
- Modify: `backend/src/ee/services/pam-web-access/pam-session-handlers.ts`
- Test: `backend/src/ee/services/pam-web-access/webpage/pam-webpage-frame-codec.test.ts`

**Interfaces:**
- Consumes: `TSessionContext` (`socket`, `relayPort`, `sessionId`, `sendMessage`, `sendSessionEnd`, `isNearSessionExpiry`, `onCleanup`, `earlyMessages`, `releaseEarlyBuffer`); `TWebAccessHandler` signature; `recordChunkInternal` (Task 4); `generateSessionRecordingSecrets`.
- Produces: `handleWebPageSession(ctx, { connectionDetails, credentials }) → { cleanup }`; `SESSION_HANDLERS[WebPage]`.

**Design note — recording secrets:** the existing recording secrets are minted lazily inside `getSessionCredentials` (the gateway path). The webpage handler never calls `getSessionCredentials`, so it must mint them itself: if `session.encryptedSessionKey` is null, call `generateSessionRecordingSecrets` and persist via `pamSessionDAL.updateById`, then keep the plaintext key in memory. This requires the handler (or a small wrapper passed via the handler entry) to have `kmsService` + `pamSessionDAL` + `pamRecordingChunkService`. Since `SESSION_HANDLERS` entries are static functions, wire these deps by making the webpage handler a factory bound in `handleWebSocketConnection`, OR (simpler) extend `TSessionContext` with an optional `recording` helper the service pre-builds. **Chosen:** extend the service so that, for the webpage type, it mints secrets before invoking the handler and passes `{ sessionKey: Buffer, recordChunk: (args) => Promise<void>, projectId }` on the context. See Step 5.

- [ ] **Step 1: Write the frame-codec + input-schema test**

`pam-webpage-frame-codec.test.ts`:

```ts
import { packFrame, unpackFrameHeader, WebPageClientMessageSchema } from "./pam-webpage-frame-codec";

test("packFrame/unpackFrameHeader round-trip", () => {
  const jpeg = Buffer.from([1, 2, 3, 4]);
  const packed = packFrame({ ts: 123456, w: 1280, h: 720, jpeg });
  const header = unpackFrameHeader(packed);
  expect(header).toEqual({ ts: 123456, w: 1280, h: 720, jpegOffset: 8 });
  expect(packed.subarray(8)).toEqual(jpeg);
});

test("client message schema accepts mouse, rejects junk", () => {
  expect(WebPageClientMessageSchema.safeParse({ type: "mouse", x: 1, y: 2, button: "left", action: "down" }).success).toBe(true);
  expect(WebPageClientMessageSchema.safeParse({ type: "nope" }).success).toBe(false);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd backend && npx vitest run src/ee/services/pam-web-access/webpage/pam-webpage-frame-codec.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the codec + schema**

`pam-webpage-frame-codec.ts`:

```ts
import { z } from "zod";

// Server->client binary frame: [ts:u32 LE][w:u16 LE][h:u16 LE][...jpeg]
export const packFrame = ({ ts, w, h, jpeg }: { ts: number; w: number; h: number; jpeg: Buffer }): Buffer => {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(ts >>> 0, 0);
  header.writeUInt16LE(w, 4);
  header.writeUInt16LE(h, 6);
  return Buffer.concat([header, jpeg]);
};

export const unpackFrameHeader = (buf: Buffer) => ({
  ts: buf.readUInt32LE(0),
  w: buf.readUInt16LE(4),
  h: buf.readUInt16LE(6),
  jpegOffset: 8
});

export const WebPageClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mouse"), x: z.number(), y: z.number(), button: z.enum(["left", "middle", "right"]), action: z.enum(["move", "down", "up", "click"]) }),
  z.object({ type: z.literal("key"), key: z.string().max(64), code: z.string().max(64).optional(), action: z.enum(["down", "up"]) }),
  z.object({ type: z.literal("scroll"), x: z.number(), y: z.number(), dx: z.number(), dy: z.number() }),
  z.object({ type: z.literal("navigate"), url: z.string().max(2048) }),
  z.object({ type: z.literal("resize"), w: z.number().int().min(320).max(3840), h: z.number().int().min(240).max(2160) })
]);

export type TWebPageClientMessage = z.infer<typeof WebPageClientMessageSchema>;
```

- [ ] **Step 4: Run codec test to verify pass**

Run: `cd backend && npx vitest run src/ee/services/pam-web-access/webpage/pam-webpage-frame-codec.test.ts`
Expected: PASS.

- [ ] **Step 5: Pre-mint recording secrets in the web-access service for the webpage type**

In `pam-web-access-service.ts` `handleWebSocketConnection`, after the session row is created and before invoking the handler, add a webpage branch that mints recording secrets and augments the context. Add to `TSessionContext` (in `pam-web-access-types.ts`) an optional field:

```ts
  recording?: {
    sessionKey: Buffer;
    projectId: string;
    recordChunk: (args: {
      chunkIndex: number;
      startElapsedMs: number;
      endElapsedMs: number;
      plaintext: Buffer;
    }) => Promise<void>;
  };
```

In the service, for `account.accountType === PamAccountType.WebPage`:

```ts
let sessionKeyBuf: Buffer;
if (!sessionRow.encryptedSessionKey) {
  const secrets = await generateSessionRecordingSecrets({ projectId, sessionId: session.id, kmsService });
  await pamSessionDAL.updateById(session.id, {
    encryptedSessionKey: secrets.encryptedSessionKey,
    gatewayUploadTokenHash: secrets.uploadTokenHash
  });
  sessionKeyBuf = secrets.sessionKey;
} else {
  sessionKeyBuf = await decryptSessionKey({ projectId, sessionId: session.id, encryptedSessionKey: sessionRow.encryptedSessionKey, kmsService });
}
ctx.recording = {
  sessionKey: sessionKeyBuf,
  projectId,
  recordChunk: (args) => pamRecordingChunkService.recordChunkInternal({ ...args, sessionId: session.id, projectId, sessionKey: sessionKeyBuf })
};
```

Wire `kmsService`, `pamSessionDAL` (already present), and `pamRecordingChunkService` into the service deps in `backend/src/server/routes/index.ts` if not already available. Confirm imports: `generateSessionRecordingSecrets`, `decryptSessionKey`.

- [ ] **Step 6: Implement the handler**

`pam-webpage-session-handler.ts`:

```ts
import { chromium, Browser, Page } from "playwright";

import { logger } from "@app/lib/logger";

import { SessionEndReason, TerminalServerMessageType } from "../pam-web-access-types";
import { TSessionContext, TSessionHandlerResult } from "../pam-web-access-types";
import { parseClientMessage } from "../pam-web-access-fns";
import { packFrame, WebPageClientMessageSchema } from "./pam-webpage-frame-codec";

const CHUNK_INTERVAL_MS = 2000;
const WS_HIGH_WATER_MARK = 1024 * 1024; // mirror RDP
const MAX_FPS = 10;

export const handleWebPageSession = async (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, sendMessage, sendSessionEnd, onCleanup, recording } = ctx;
  const details = params.connectionDetails as { startPath?: string };
  const startPath = details.startPath ?? "/";
  const startedAt = Date.now();

  let browser: Browser | null = null;
  let page: Page | null = null;
  let cleanedUp = false;

  // recording buffer
  let chunkIndex = 0;
  let frameBuf: Array<{ type: "web_frame"; elapsedMs: number; jpegBase64: string; w: number; h: number }> = [];
  let chunkStartMs = 0;
  let lastFrameSent = 0;

  const flushChunk = async () => {
    if (!recording || frameBuf.length === 0) return;
    const events = frameBuf;
    const start = chunkStartMs;
    const end = events[events.length - 1].elapsedMs;
    frameBuf = [];
    chunkStartMs = end;
    const idx = chunkIndex;
    chunkIndex += 1;
    try {
      await recording.recordChunk({
        chunkIndex: idx,
        startElapsedMs: start,
        endElapsedMs: end,
        plaintext: Buffer.from(JSON.stringify(events))
      });
    } catch (err) {
      logger.error({ sessionId, err }, `webpage session: chunk write failed [sessionId=${sessionId}]`);
    }
  };

  const teardown = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try { await flushChunk(); } catch { /* best effort */ }
    try { await browser?.close(); } catch (err) { logger.debug(err, "webpage session: browser close error"); }
  };

  try {
    browser = await chromium.launch({
      args: [`--host-resolver-rules=MAP * 127.0.0.1:${relayPort}`],
      headless: true
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();

    // Playwright >=1.59: page.screencast; else CDP fallback (see below).
    const onFrame = (frame: { data: Buffer | string; timestamp?: number; width?: number; height?: number }) => {
      const elapsedMs = Date.now() - startedAt;
      const jpeg = Buffer.isBuffer(frame.data) ? frame.data : Buffer.from(frame.data as string, "base64");
      const w = frame.width ?? 1280;
      const h = frame.height ?? 720;

      // record
      if (recording) {
        if (frameBuf.length === 0) chunkStartMs = elapsedMs;
        frameBuf.push({ type: "web_frame", elapsedMs, jpegBase64: jpeg.toString("base64"), w, h });
        if (elapsedMs - chunkStartMs >= CHUNK_INTERVAL_MS) void flushChunk();
      }

      // live stream (drop frames on backpressure / FPS cap)
      const now = Date.now();
      if (now - lastFrameSent < 1000 / MAX_FPS) return;
      if (socket.bufferedAmount > WS_HIGH_WATER_MARK) return;
      lastFrameSent = now;
      try { socket.send(packFrame({ ts: elapsedMs, w, h, jpeg }), { binary: true }); }
      catch (err) { logger.debug(err, "webpage session: frame send error"); }
    };

    // Prefer high-level API; fall back to CDP if unavailable.
    // @ts-expect-error screencast may be absent on older playwright
    if (page.screencast?.start) {
      // @ts-expect-error see above
      await page.screencast.start({ size: { width: 1280, height: 720 }, onFrame: (f) => onFrame(f) });
    } else {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 720 });
      cdp.on("Page.screencastFrame", async (evt: { data: string; sessionId: number; metadata: { deviceWidth?: number; deviceHeight?: number } }) => {
        onFrame({ data: evt.data, width: evt.metadata.deviceWidth, height: evt.metadata.deviceHeight });
        try { await cdp.send("Page.screencastFrameAck", { sessionId: evt.sessionId }); } catch { /* closed */ }
      });
    }

    await page.goto(`http://internal${startPath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    sendMessage({ type: TerminalServerMessageType.Ready, data: "" });

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      if (cleanedUp || !page) return;
      const msg = parseClientMessage(raw, WebPageClientMessageSchema);
      if (!msg) return;
      void (async () => {
        try {
          if (msg.type === "mouse") {
            if (msg.action === "move") await page!.mouse.move(msg.x, msg.y);
            else if (msg.action === "down") await page!.mouse.down({ button: msg.button });
            else if (msg.action === "up") await page!.mouse.up({ button: msg.button });
            else await page!.mouse.click(msg.x, msg.y, { button: msg.button });
          } else if (msg.type === "key") {
            if (msg.action === "down") await page!.keyboard.down(msg.key);
            else await page!.keyboard.up(msg.key);
          } else if (msg.type === "scroll") {
            await page!.mouse.wheel(msg.dx, msg.dy);
          } else if (msg.type === "resize") {
            await page!.setViewportSize({ width: msg.w, height: msg.h });
          } else if (msg.type === "navigate") {
            // gate: only same-origin relative paths for the demo
            if (msg.url.startsWith("/")) await page!.goto(`http://internal${msg.url}`, { waitUntil: "domcontentloaded" });
          }
        } catch (err) {
          logger.debug({ sessionId, err }, "webpage session: input apply error");
        }
      })();
    });

    socket.on("close", () => { if (!cleanedUp) onCleanup(); void teardown(); });

    return { cleanup: teardown };
  } catch (err) {
    logger.error({ sessionId, err }, `webpage session: setup failed [sessionId=${sessionId}]`);
    sendSessionEnd(SessionEndReason.SetupFailed);
    await teardown();
    return { cleanup: teardown };
  }
};
```

Notes for the implementer:
- `--host-resolver-rules=MAP * 127.0.0.1:<relayPort>` makes the browser send all traffic to the relay, which tunnels to the single target host:port. This is the demo's single-cooperative-target simplification; the `http://internal<path>` URL's host is irrelevant because of the resolver rule (the relay ignores Host). Document the vhost/TLS caveat inline.
- Confirm `SessionEndReason.SetupFailed` and `TerminalServerMessageType.Ready` exist in `pam-web-access-types.ts` (they do — RDP/SSH use them).

- [ ] **Step 7: Register the handler**

In `pam-session-handlers.ts` add the import and the entry:

```ts
import { handleWebPageSession } from "./webpage/pam-webpage-session-handler";
// ...
  [PamAccountType.WebPage]: {
    gatewayAccountType: PamAccountType.WebPage,
    handler: handleWebPageSession
  }
```

- [ ] **Step 8: Type check**

Run: `cd backend && npm run type:check 2>&1 | tail -8`
Expected: no new errors (the two `@ts-expect-error` lines are intentional for the screencast fallback).

- [ ] **Step 9: Commit**

```bash
git add backend/src/ee/services/pam-web-access/webpage backend/src/ee/services/pam-web-access/pam-session-handlers.ts backend/src/ee/services/pam-web-access/pam-web-access-types.ts backend/src/ee/services/pam-web-access/pam-web-access-service.ts backend/src/server/routes/index.ts
git commit -m "feat(pam): webpage session handler with Playwright screencast + recording"
```

---

## Task 7: Frontend — enum, icon, replay type, replay view, dispatch

**Files:**
- Modify: `frontend/src/hooks/api/pam/enums.ts`
- Add: `frontend/public/images/integrations/WebPage.png`
- Modify: `frontend/src/hooks/api/pam/session-playback/types.ts`
- Create: `frontend/src/pages/pam/PamSessionsPage/components/WebReplayView/WebReplayView.tsx`
- Create: `frontend/src/pages/pam/PamSessionsPage/components/WebReplayView/webReplayPlayer.ts`
- Modify: `frontend/src/pages/pam/PamSessionsPage/components/SessionDetailSheet.tsx`

**Interfaces:**
- Consumes: `useDecryptedSessionLogs` / `decryptOneChunk` (unchanged), `web_frame` events emitted by the backend.
- Produces: `WebReplayView` component rendered for `PamAccountType.WebPage` sessions.

- [ ] **Step 1: Mirror the enum**

In `frontend/src/hooks/api/pam/enums.ts` add `WebPage = "webpage"`.

- [ ] **Step 2: Add the icon**

Place a globe/web PNG at `frontend/public/images/integrations/WebPage.png` (name must match the backend config `icon`).

- [ ] **Step 3: Extend the playback event type**

In `session-playback/types.ts` add:

```ts
export type TWebFrameEvent = { type: "web_frame"; elapsedMs: number; jpegBase64: string; w: number; h: number };
```

- [ ] **Step 4: Implement the player**

`webReplayPlayer.ts` — a minimal player that keeps a sorted array of `TWebFrameEvent`, and on `seek(ms)` draws the latest frame with `elapsedMs <= ms`:

```ts
import { TWebFrameEvent } from "@app/hooks/api/pam/session-playback/types";

export class WebReplayPlayer {
  private frames: TWebFrameEvent[] = [];
  constructor(private ctx: CanvasRenderingContext2D) {}

  setFrames(frames: TWebFrameEvent[]) {
    this.frames = [...frames].sort((a, b) => a.elapsedMs - b.elapsedMs);
  }

  get totalMs() { return this.frames.length ? this.frames[this.frames.length - 1].elapsedMs : 0; }

  async drawAt(ms: number) {
    let target: TWebFrameEvent | undefined;
    for (const f of this.frames) { if (f.elapsedMs <= ms) target = f; else break; }
    if (!target) return;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = `data:image/jpeg;base64,${target!.jpegBase64}`;
    });
    this.ctx.canvas.width = target.w;
    this.ctx.canvas.height = target.h;
    this.ctx.drawImage(img, 0, 0);
  }
}
```

- [ ] **Step 5: Implement the view**

`WebReplayView.tsx` — model the controls on `RdpReplayView.tsx` (play/pause/seek/scrub), but back it with `WebReplayPlayer`. It takes `events` (the decrypted `web_frame` list from `useDecryptedSessionLogs`), a canvas ref, a timeline slider bound to `player.totalMs`, and a `requestAnimationFrame` tick that advances a clock and calls `player.drawAt(currentMs)`. Reuse `RdpReplayView`'s layout/styling. Filter `events` to `type === "web_frame"` before `setFrames`.

- [ ] **Step 6: Dispatch webpage sessions to the view**

In `SessionDetailSheet.tsx`, extend the type check:

```ts
const isWebPageSession = session.accountType === PamAccountType.WebPage;
```

and add a tab branch that renders `<WebReplayView events={filteredEvents} isStreaming={isActive} />` when `isWebPageSession`, alongside the existing RDP branch. Lazy-import `WebReplayView` like `RdpReplayView`.

- [ ] **Step 7: Type check + lint**

Run: `cd frontend && npm run type:check 2>&1 | tail -5`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/api/pam/enums.ts frontend/public/images/integrations/WebPage.png frontend/src/hooks/api/pam/session-playback/types.ts frontend/src/pages/pam/PamSessionsPage/components/WebReplayView frontend/src/pages/pam/PamSessionsPage/components/SessionDetailSheet.tsx
git commit -m "feat(pam): web page session replay view"
```

---

## Task 8: Frontend — live web page session view

**Files:**
- Create: `frontend/src/pages/pam/PamAccountAccessPage/useWebPageSession.ts`
- Create/Modify: a canvas view under `PamAccountAccessPage` that renders the live session (model on the RDP live path / `useWebAccessSession`).

**Interfaces:**
- Consumes: `POST /pam/accounts/:accountId/web-access-ticket` → `{ ticket }`; WS `/api/v1/pam/accounts/:accountId/web-access?ticket=...`.
- Produces: a live canvas that draws server JPEG frames and sends input JSON.

- [ ] **Step 1: Implement the hook**

`useWebPageSession.ts`: request the ticket, open the WebSocket (`binaryType = "arraybuffer"`), and:
- On a binary message: read the 8-byte header (`ts u32`, `w u16`, `h u16` LE), decode the JPEG (`Blob` → `createImageBitmap`), size the canvas to `w×h`, `drawImage`.
- On a JSON message: handle `ready` (clear spinner) and `session_end` (show reason).
- Attach canvas listeners: `mousemove`/`mousedown`/`mouseup`/`click` → `{ type:"mouse", x, y, button, action }` (translate `button` and clamp `x/y` to canvas coords); `keydown`/`keyup` → `{ type:"key", key, code, action }`; `wheel` → `{ type:"scroll", x, y, dx, dy }`. Send as JSON strings.

Reuse the WS URL builder and ticket-fetch pattern from `useWebAccessSession.ts`.

- [ ] **Step 2: Wire the view**

Add a canvas component and route the webpage account type to it in `PamAccountAccessPage` (where SSH/DB/RDP live views are dispatched). Match the existing dispatch pattern.

- [ ] **Step 3: Type check**

Run: `cd frontend && npm run type:check 2>&1 | tail -5`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/pam/PamAccountAccessPage
git commit -m "feat(pam): live web page session canvas + input"
```

---

## Task 9: Manual end-to-end validation + docs

**Files:**
- Modify: `backend/src/ee/services/pam/CLAUDE.md` (document the webpage type + the backend-direct recording divergence).

- [ ] **Step 1: Bring up the stack**

Run the local dev stack (`docker-compose.dev.yml` or `npm run dev` per repo convention) with the gateway + relay already running. Run `cd backend && npx playwright install chromium` if not done.

- [ ] **Step 2: Reviewable checks**

Run: `make reviewable-api && make reviewable-ui`
Expected: lint + type checks pass.

- [ ] **Step 3: Create a webpage account**

In the UI: create a `Web Page` account pointing `host`/`port` at an internal HTTP page reachable through the gateway (e.g. a simple container serving HTML). Confirm the create form auto-renders (host, port, Use HTTPS, startPath) and the account is launchable (no `NoCredential` / `NoRecordingConfig` blockers).

- [ ] **Step 4: Launch + interact**

Launch a Browser session. Confirm: the page renders on the canvas, mouse/keyboard/scroll work, a form submit works, and navigation loads assets.

- [ ] **Step 5: End + replay**

End the session. Open it on the Sessions page and confirm the recording replays (frames redraw, scrubber seeks). Verify in Postgres that `pam_session_event_chunks` rows exist with `storageBackend = 'postgres'` and non-null `encryptedEventsBlob` for the session.

- [ ] **Step 6: Tamper-proofing spot check**

Confirm there is no user-facing endpoint to delete/edit chunks, and that `pam_sessions.encryptedSessionKey` is a KMS blob (not plaintext). Confirm replay requires `ViewSessions`.

- [ ] **Step 7: Document + commit**

Add a short section to `pam/CLAUDE.md` describing the `webpage` type and that its recording is written backend-direct (not via the gateway upload token), reusing the chunk encryption/AAD contract.

```bash
git add backend/src/ee/services/pam/CLAUDE.md
git commit -m "docs(pam): document webpage target and backend-direct recording"
```

---

## Self-Review Notes

- **Spec coverage:** account type (T1), launch not blocked by credential/recording gates (T1/T2), Playwright-in-backend + gateway routing (T5/T6), handler + WS protocol (T6), backend-direct recording matching the decrypt contract (T3/T4/T6), replay view (T7), live view (T8), tamper-proofing verification (T9), demo-vs-prod honesty (inline notes). All spec sections map to a task.
- **Known risk:** the Playwright `page.screencast` API version. T5 Step 2 + T6 Step 6 include the CDP `Page.startScreencast` fallback so the plan does not hard-depend on a specific Playwright minor.
- **Type consistency:** `recordChunkInternal`, `encryptChunk`, `buildChunkAad`, `packFrame`/`unpackFrameHeader`, `WebPageClientMessageSchema`, `handleWebPageSession`, `TWebFrameEvent`, `WebReplayPlayer` are used with the same names across tasks.
- **Deferred verification (call out during execution):** exact account-create expression for `credentialConfigured` (T2 S5); whether `pam-web-access-service` already has `kmsService`/`pamRecordingChunkService` in scope or needs DI wiring (T6 S5); the standalone image's base distro for `--with-deps` (T5 S3).
