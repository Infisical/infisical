# Stripe API Key Secret Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stripe API key secret rotation provider that mints a new restricted key on each rotation and expires the one from two rotations ago, using the existing Stripe app connection.

**Architecture:** A rotation factory in `backend/src/ee/services/secret-rotation-v2/stripe-api-key/` following the sibling providers. Rotation is create-then-retire, never Stripe's `rotate` endpoint, because `rotate` kills the old token instantly. The framework's two-slot credential model supplies the handover window. Stripe encrypts the new secret to a public key we supply, so each create generates a throwaway RSA keypair and decrypts the JWE in-process.

**Tech Stack:** TypeScript, Fastify 4, Zod, Knex, BullMQ, Vitest, React 18, TanStack Query, react-hook-form.

**Spec:** `docs/superpowers/specs/2026-09-17-stripe-api-key-rotation-design.md`

## Global Constraints

- Read `backend/CODE_QUALITY.md` before any backend task and check the work against it before calling a task done.
- Default to no comments. A comment earns its place only by explaining why: a non-obvious constraint, a workaround, or an ordering dependency. Never narrate the next line.
- Every Stripe HTTP call happens outside the database transaction. The transaction is opened inside the framework's callback and touches only Postgres.
- Never log a raw Stripe response body. The key list endpoint returns plaintext secrets.
- No em dashes in any prose, including docs and code comments.
- Frontend UI follows `DESIGN.md` v3 components. Use `@app/components/v3`, never v2, in new files.
- Preview API version is `2026-08-26.preview` and is defined in exactly one place.
- Stripe key ids look like `mk_...`, and the secrets they carry are `rk_...` restricted keys. Never assert an `sk_` prefix.

## Corrections to the spec, applied in this plan

Two spec statements turned out to be unbuildable as written. The plan supersedes them.

- The spec says the 158 permission names ship as "one backend constant, frontend imports that same list". The frontend and backend are separate packages and cannot import each other. Instead the names ride on the rotation's list-option `template`, which the form already reads through `useSecretRotationV2Option`.
- The spec names minted keys `infisical-rotation-<rotationId>-<timestamp>`. At create time the factory receives only `{ parameters, secretsMapping, connection, rotationInterval }` (`secret-rotation-v2-service.ts:614`), so there is no rotation id. Keys are named from the mapped secret name instead.

---

### Task 1: Stripe public client

Extracts the auth, headers and error shaping that are currently private inside `stripe-connection-fns.ts`, so rotation and the connection check share one definition.

**Files:**
- Create: `backend/src/services/app-connection/stripe/stripe-connection-public-client.ts`
- Create: `backend/src/services/app-connection/stripe/stripe-connection-public-client.test.ts`
- Modify: `backend/src/services/app-connection/stripe/stripe-connection-fns.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `STRIPE_PREVIEW_API_VERSION: string`, `STRIPE_API_KEYS_URL: string`, `getStripeSecretKey(): string`, `getStripePlatformRequestConfig(accountId: string): AxiosRequestConfig`, `getStripeMerchantRequestConfig(apiKey: string): AxiosRequestConfig`, `withIdempotencyKey(config: AxiosRequestConfig): AxiosRequestConfig`, `getStripeErrorMessage(error: unknown): string`, `getStripeErrorStatus(error: unknown): number | undefined`, `throwStripeApiKeyManagementError(accountId: string, error: unknown): never`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/app-connection/stripe/stripe-connection-public-client.test.ts`:

```ts
import { AxiosError } from "axios";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_platform" })
}));

// eslint-disable-next-line import/first
import {
  getStripeErrorMessage,
  getStripeErrorStatus,
  getStripeMerchantRequestConfig,
  getStripePlatformRequestConfig,
  STRIPE_PREVIEW_API_VERSION,
  withIdempotencyKey
} from "./stripe-connection-public-client";

const axiosErrorWith = (status: number, data: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
    data
  });

describe("stripe public client", () => {
  it("authenticates as the platform and names the account", () => {
    const config = getStripePlatformRequestConfig("acct_123");

    expect(config.auth).toEqual({ username: "sk_test_platform", password: "" });
    expect(config.headers).toEqual({
      "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
      "Stripe-Context": "acct_123"
    });
  });

  it("authenticates as a merchant key without context or preview version", () => {
    const config = getStripeMerchantRequestConfig("rk_test_merchant");

    expect(config.auth).toEqual({ username: "rk_test_merchant", password: "" });
    expect(config.headers).toBeUndefined();
  });

  it("adds an idempotency key without dropping existing headers", () => {
    const config = withIdempotencyKey(getStripePlatformRequestConfig("acct_123"));

    expect(config.headers?.["Stripe-Context"]).toBe("acct_123");
    expect(config.headers?.["Idempotency-Key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("reads Stripe's own error message when there is one", () => {
    const error = axiosErrorWith(400, { error: { message: "Invalid permissions: nope" } });

    expect(getStripeErrorMessage(error)).toBe("Invalid permissions: nope");
    expect(getStripeErrorStatus(error)).toBe(400);
  });

  it("falls back to the axios message and handles plain errors", () => {
    expect(getStripeErrorMessage(axiosErrorWith(500, undefined))).toBe("Request failed");
    expect(getStripeErrorMessage(new Error("socket hang up"))).toBe("socket hang up");
    expect(getStripeErrorStatus(new Error("socket hang up"))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `make test-api-unit SPEC=stripe-connection-public-client`
Expected: FAIL, cannot resolve `./stripe-connection-public-client`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/app-connection/stripe/stripe-connection-public-client.ts`:

```ts
import crypto from "node:crypto";

import { AxiosError, AxiosRequestConfig } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

// The Managed API Keys API is in private preview and is only served under a preview API version.
export const STRIPE_PREVIEW_API_VERSION = "2026-08-26.preview";

export const STRIPE_API_KEYS_URL = `${IntegrationUrls.STRIPE_API_URL}/v2/iam/api_keys`;

export const getStripeSecretKey = () => {
  const { INF_APP_CONNECTION_STRIPE_SECRET_KEY } = getConfig();

  if (!INF_APP_CONNECTION_STRIPE_SECRET_KEY) {
    throw new InternalServerError({
      message: "Stripe is not configured on this instance. Set the Stripe App Connection credentials to enable it."
    });
  }

  return INF_APP_CONNECTION_STRIPE_SECRET_KEY;
};

/** Infisical acting on a customer's account: our own key, with Stripe-Context naming the account. */
export const getStripePlatformRequestConfig = (accountId: string): AxiosRequestConfig => ({
  auth: { username: getStripeSecretKey(), password: "" },
  headers: {
    "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
    "Stripe-Context": accountId
  }
});

/** A rotated merchant key acting as itself. It is not the platform, so it carries neither header. */
export const getStripeMerchantRequestConfig = (apiKey: string): AxiosRequestConfig => ({
  auth: { username: apiKey, password: "" }
});

export const withIdempotencyKey = (config: AxiosRequestConfig): AxiosRequestConfig => ({
  ...config,
  headers: { ...config.headers, "Idempotency-Key": crypto.randomUUID() }
});
```

Axios types `headers` as a union that includes `AxiosHeaders`, so if the spread above does not
type-check, narrow it with `...(config.headers as Record<string, string>)` rather than widening the
helper's return type.

```ts

export const getStripeErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;

    return typeof message === "string" ? message : error.message;
  }

  return (error as Error)?.message ?? "Unknown error";
};

export const getStripeErrorStatus = (error: unknown): number | undefined =>
  error instanceof AxiosError ? error.response?.status : undefined;

/**
 * Nothing proactively notices that a customer uninstalled the app, because the connection stores no
 * tokens, so it arrives here as a 403. The remedy is offered conditionally rather than asserted.
 */
export const throwStripeApiKeyManagementError = (accountId: string, error: unknown): never => {
  throw new BadRequestError({
    message:
      `Infisical cannot manage API keys on Stripe account '${accountId}'. ` +
      `Stripe returned ${getStripeErrorStatus(error) ?? "no status"}: ${getStripeErrorMessage(error)}. ` +
      `If the Infisical app was removed from this Stripe account, reinstall it and reconnect.`
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `make test-api-unit SPEC=stripe-connection-public-client`
Expected: PASS, 5 tests.

- [ ] **Step 5: Refactor the connection onto the client**

In `backend/src/services/app-connection/stripe/stripe-connection-fns.ts`, delete the local `STRIPE_PREVIEW_API_VERSION` constant and the local `getStripeSecretKey`, and import from the public client instead. Replace the body of `assertCanManageApiKeys` with:

```ts
const assertCanManageApiKeys = async (accountId: string) => {
  try {
    await request.get(STRIPE_API_KEYS_URL, getStripePlatformRequestConfig(accountId));
  } catch (error) {
    throwStripeApiKeyManagementError(accountId, error);
  }
};
```

Keep `exchangeStripeOAuthCode` as it is, other than sourcing `getStripeSecretKey` from the client. Its error handling reads `error_description`, which is an OAuth-shaped body rather than a Stripe API error, so it does not use `getStripeErrorMessage`.

- [ ] **Step 6: Verify nothing else broke**

Run: `cd backend && npm run type:check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/app-connection/stripe/
git commit -m "refactor(app-connections): extract shared Stripe request client"
```

---

### Task 2: JWE decryption

Isolated crypto with no HTTP in it, so it can be tested exhaustively against fixtures. Also pins the FIPS behaviour the whole live-mode path depends on.

**Files:**
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-jwe.ts`
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-jwe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateStripeEncryptionKeyPair(): Promise<{ publicKey: string; privateKey: string }>`, `decryptStripeJwe(jwe: string, privateKeyPem: string): string`, `readStripeSecret(secretKey: TStripeSecretKeyField | undefined, privateKeyPem: string): string`, and the type `TStripeSecretKeyField = { token?: string | null; encrypted_secret?: { ciphertext?: string | null } | null }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-jwe.test.ts`:

```ts
import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptStripeJwe,
  generateStripeEncryptionKeyPair,
  readStripeSecret
} from "./stripe-api-key-jwe";

/** Builds the compact JWE Stripe would return, so the test proves the real unwrap path. */
const encryptJwe = (
  plaintext: string,
  publicKeyPem: string,
  { alg = "RSA-OAEP", enc = "A256GCM" }: { alg?: string; enc?: string } = {}
) => {
  const header = Buffer.from(JSON.stringify({ alg, enc })).toString("base64url");
  const contentKey = crypto.randomBytes(32);
  const wrapped = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: alg === "RSA-OAEP" ? "sha1" : "sha256"
    },
    contentKey
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", contentKey, iv);
  cipher.setAAD(Buffer.from(header, "ascii"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    header,
    wrapped.toString("base64url"),
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url")
  ].join(".");
};

describe("decryptStripeJwe", () => {
  it("round-trips both algorithms Stripe may use, under FIPS", async () => {
    // The unit suite runs with --force-fips. OAEP with SHA-1 is the algorithm Stripe returns as
    // `RSA-OAEP`, and this assertion is what stops a toolchain bump from breaking live mode silently.
    expect(crypto.getFips()).toBe(1);

    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();

    for (const alg of ["RSA-OAEP", "RSA-OAEP-256"]) {
      const jwe = encryptJwe("rk_live_secret", publicKey, { alg });
      expect(decryptStripeJwe(jwe, privateKey)).toBe("rk_live_secret");
    }
  });

  it("rejects a JWE without exactly five segments", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(() => decryptStripeJwe("a.b.c", privateKey)).toThrow(/5 segments, got 3/);
  });

  it("names an unsupported key algorithm rather than guessing", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_live_secret", publicKey, { alg: "RSA1_5" });

    expect(() => decryptStripeJwe(jwe, privateKey)).toThrow(/RSA1_5/);
  });

  it("rejects an unsupported content encryption algorithm", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_live_secret", publicKey, { enc: "A128GCM" });

    expect(() => decryptStripeJwe(jwe, privateKey)).toThrow(/A128GCM/);
  });

  it("fails a tampered ciphertext", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const segments = encryptJwe("rk_live_secret", publicKey).split(".");
    segments[4] = Buffer.alloc(16).toString("base64url");

    expect(() => decryptStripeJwe(segments.join("."), privateKey)).toThrow();
  });
});

describe("readStripeSecret", () => {
  it("prefers the plaintext token test mode returns", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(readStripeSecret({ token: "rk_test_plain", encrypted_secret: null }, privateKey)).toBe(
      "rk_test_plain"
    );
  });

  it("decrypts the JWE live mode returns", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_live_secret", publicKey);

    expect(readStripeSecret({ encrypted_secret: { ciphertext: jwe } }, privateKey)).toBe(
      "rk_live_secret"
    );
  });

  it("throws when Stripe returns neither", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(() => readStripeSecret({}, privateKey)).toThrow(/without a secret/);
    expect(() => readStripeSecret(undefined, privateKey)).toThrow(/without a secret/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `make test-api-unit SPEC=stripe-api-key-jwe`
Expected: FAIL, cannot resolve `./stripe-api-key-jwe`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-jwe.ts`:

```ts
import crypto from "node:crypto";

import { BadRequestError } from "@app/lib/errors";

export type TStripeSecretKeyField = {
  token?: string | null;
  encrypted_secret?: { ciphertext?: string | null } | null;
};

// Stripe names OAEP with SHA-1 `RSA-OAEP`, which is the JOSE spelling. Both are accepted by the
// FIPS provider for key transport, so neither needs a fallback.
const SUPPORTED_KEY_ALGORITHMS: Record<string, "sha1" | "sha256"> = {
  "RSA-OAEP": "sha1",
  "RSA-OAEP-256": "sha256"
};

const SUPPORTED_CONTENT_ALGORITHM = "A256GCM";

export const generateStripeEncryptionKeyPair = async () =>
  new Promise<{ publicKey: string; privateKey: string }>((resolve, reject) => {
    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
      },
      (error, publicKey, privateKey) => (error ? reject(error) : resolve({ publicKey, privateKey }))
    );
  });

export const decryptStripeJwe = (jwe: string, privateKeyPem: string): string => {
  const segments = jwe.split(".");

  if (segments.length !== 5) {
    throw new BadRequestError({
      message: `Stripe returned a malformed encrypted secret: expected a compact JWE with 5 segments, got ${segments.length}.`
    });
  }

  const [protectedHeader, wrappedKey, iv, ciphertext, authTag] = segments;

  let header: { alg?: string; enc?: string };

  try {
    header = JSON.parse(Buffer.from(protectedHeader, "base64url").toString()) as typeof header;
  } catch {
    throw new BadRequestError({
      message: "Stripe returned an encrypted secret whose JWE header could not be parsed."
    });
  }

  const oaepHash = header.alg ? SUPPORTED_KEY_ALGORITHMS[header.alg] : undefined;

  if (!oaepHash) {
    throw new BadRequestError({
      message: `Stripe encrypted the secret with an unsupported key algorithm '${header.alg ?? "none"}'. Infisical supports RSA-OAEP and RSA-OAEP-256.`
    });
  }

  if (header.enc !== SUPPORTED_CONTENT_ALGORITHM) {
    throw new BadRequestError({
      message: `Stripe encrypted the secret with an unsupported content algorithm '${header.enc ?? "none"}'. Infisical supports ${SUPPORTED_CONTENT_ALGORITHM}.`
    });
  }

  const contentKey = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
    Buffer.from(wrappedKey, "base64url")
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(protectedHeader, "ascii"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
};

/**
 * Test and sandbox accounts return the secret in plaintext, live accounts return a JWE. Both shapes
 * are real, and the one we develop against is not the one that matters.
 */
export const readStripeSecret = (secretKey: TStripeSecretKeyField | undefined, privateKeyPem: string): string => {
  if (secretKey?.token) return secretKey.token;

  const ciphertext = secretKey?.encrypted_secret?.ciphertext;

  if (!ciphertext) {
    throw new BadRequestError({
      message: "Stripe returned an API key without a secret. The key may need to be created again."
    });
  }

  return decryptStripeJwe(ciphertext, privateKeyPem);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `make test-api-unit SPEC=stripe-api-key-jwe`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ee/services/secret-rotation-v2/stripe-api-key/
git commit -m "feat(secret-rotation): add Stripe JWE secret decryption"
```

---

### Task 3: List API keys for the form, without leaking secrets

Stripe returns every key's plaintext secret in the list response. This task exists as much to strip that as to paginate.

**Files:**
- Modify: `backend/src/services/app-connection/stripe/stripe-connection-public-client.ts`
- Create: `backend/src/services/app-connection/stripe/stripe-connection-service.ts`
- Create: `backend/src/services/app-connection/stripe/stripe-connection-service.test.ts`
- Modify: `backend/src/services/app-connection/stripe/index.ts`
- Modify: `backend/src/services/app-connection/app-connection-service.ts:1415`
- Modify: `backend/src/server/routes/v1/app-connection-routers/stripe-connection-router.ts`

**Interfaces:**
- Consumes: `getStripePlatformRequestConfig`, `STRIPE_API_KEYS_URL`, `throwStripeApiKeyManagementError` from Task 1.
- Produces: `listStripeApiKeys(accountId: string): Promise<TStripeApiKeyListItem[]>` from the public client, and `stripeConnectionService(getAppConnection)` exposing `listApiKeys(connectionId, actor): Promise<TStripeApiKeySummary[]>` where `TStripeApiKeySummary = { id: string; name: string; status: string; permissions: string[]; connectPermissions: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/app-connection/stripe/stripe-connection-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_platform" })
}));
vi.mock("@app/lib/config/request", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
  request: { get: (...args: unknown[]) => (getMock as any)(...args) }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { stripeConnectionService } from "./stripe-connection-service";

const keyPage = (id: string, next?: string) => ({
  data: {
    data: [
      {
        id,
        name: `key-${id}`,
        status: "active",
        permissions: ["charge_read"],
        connect_permissions: [],
        // Stripe really does return this, in full, for every key.
        secret_key: { token: `rk_test_${id}_full_plaintext_secret`, secret_token_redacted: "rk_test_...ab12" }
      }
    ],
    next_page_url: next ?? null
  }
});

const makeService = () =>
  stripeConnectionService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.fn(async () => ({ credentials: { accountId: "acct_123" } })) as any
  );

describe("stripeConnectionService.listApiKeys", () => {
  beforeEach(() => getMock.mockReset());

  it("never returns the plaintext secret Stripe includes in every list item", async () => {
    getMock.mockResolvedValueOnce(keyPage("mk_1"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys = await makeService().listApiKeys("connection-id", {} as any);

    expect(keys).toEqual([
      {
        id: "mk_1",
        name: "key-mk_1",
        status: "active",
        permissions: ["charge_read"],
        connectPermissions: []
      }
    ]);
    expect(JSON.stringify(keys)).not.toContain("plaintext_secret");
    expect(JSON.stringify(keys)).not.toContain("secret_key");
  });

  it("follows next_page_url instead of returning only the first page", async () => {
    getMock
      .mockResolvedValueOnce(keyPage("mk_1", "https://api.stripe.com/v2/iam/api_keys?page=2"))
      .mockResolvedValueOnce(keyPage("mk_2"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys = await makeService().listApiKeys("connection-id", {} as any);

    expect(keys.map((key) => key.id)).toEqual(["mk_1", "mk_2"]);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[0][0]).toContain("limit=100");
    expect(getMock.mock.calls[1][0]).toBe("https://api.stripe.com/v2/iam/api_keys?page=2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `make test-api-unit SPEC=stripe-connection-service`
Expected: FAIL, cannot resolve `./stripe-connection-service`.

- [ ] **Step 3: Add the paginated list to the public client**

Append to `stripe-connection-public-client.ts`, and add `/* eslint-disable no-await-in-loop */` as the first line of the file:

```ts
export type TStripeApiKeyListItem = {
  id: string;
  name?: string | null;
  status?: string | null;
  permissions?: string[] | null;
  connect_permissions?: string[] | null;
};

const STRIPE_LIST_PAGE_SIZE = 100;

// Stripe rejects limit=200 with "The maximum page limit is 100", so this is the largest page it
// serves. The page cap is a runaway guard, not an expected bound.
const STRIPE_LIST_MAX_PAGES = 50;

export const listStripeApiKeys = async (accountId: string): Promise<TStripeApiKeyListItem[]> => {
  const config = getStripePlatformRequestConfig(accountId);
  const keys: TStripeApiKeyListItem[] = [];

  let url: string | undefined = `${STRIPE_API_KEYS_URL}?limit=${STRIPE_LIST_PAGE_SIZE}`;
  let pages = 0;

  while (url && pages < STRIPE_LIST_MAX_PAGES) {
    const { data } = await request.get<{
      data?: TStripeApiKeyListItem[];
      next_page_url?: string | null;
    }>(url, config);

    keys.push(...(data?.data ?? []));
    url = data?.next_page_url ?? undefined;
    pages += 1;
  }

  if (url) {
    logger.warn(
      `listStripeApiKeys: stopped after ${STRIPE_LIST_MAX_PAGES} pages for account ${accountId}, the list is truncated`
    );
  }

  return keys;
};
```

Add `import { request } from "@app/lib/config/request";` and `import { logger } from "@app/lib/logger";` to the file's imports.

- [ ] **Step 4: Write the service**

Create `backend/src/services/app-connection/stripe/stripe-connection-service.ts`:

```ts
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listStripeApiKeys, throwStripeApiKeyManagementError } from "./stripe-connection-public-client";
import { TStripeConnection } from "./stripe-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TStripeConnection>;

export type TStripeApiKeySummary = {
  id: string;
  name: string;
  status: string;
  permissions: string[];
  connectPermissions: string[];
};

export const stripeConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApiKeys = async (connectionId: string, actor: OrgServiceActor): Promise<TStripeApiKeySummary[]> => {
    const appConnection = await getAppConnection(AppConnection.Stripe, connectionId, actor);
    const { accountId } = appConnection.credentials;

    try {
      const keys = await listStripeApiKeys(accountId);

      // Stripe returns secret_key.token, in full plaintext, for every key in the account. Mapping to
      // an explicit shape here is what keeps it out of the HTTP response.
      return keys.map((key) => ({
        id: key.id,
        name: key.name ?? "",
        status: key.status ?? "",
        permissions: key.permissions ?? [],
        connectPermissions: key.connect_permissions ?? []
      }));
    } catch (error) {
      return throwStripeApiKeyManagementError(accountId, error);
    }
  };

  return { listApiKeys };
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test-api-unit SPEC=stripe-connection-service`
Expected: PASS, 2 tests.

- [ ] **Step 6: Wire the service and the route**

Add both of these to `backend/src/services/app-connection/stripe/index.ts`:

```ts
export * from "./stripe-connection-public-client";
export * from "./stripe-connection-service";
```

The rotation factory imports the public client by its direct path, matching the Supabase rotation, but
`app-connection-service.ts` resolves `stripeConnectionService` through this barrel.

In `backend/src/services/app-connection/app-connection-service.ts`, beside `supabase:` at line 1415, add:

```ts
    stripe: stripeConnectionService(connectAppConnectionById),
```

This is a plain object literal, so omitting it compiles and then 500s at runtime. Import `stripeConnectionService` from `./stripe` alongside the other connection service imports.

In `backend/src/server/routes/v1/app-connection-routers/stripe-connection-router.ts`, add the endpoint after `registerAppConnectionEndpoints`:

```ts
  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/api-keys`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listStripeApiKeys",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          // An allowlist, deliberately. Stripe's own list response carries every key's plaintext
          // secret, so a passthrough schema here would ship them to the browser.
          apiKeys: z
            .object({
              id: z.string(),
              name: z.string(),
              status: z.string(),
              permissions: z.string().array(),
              connectPermissions: z.string().array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const apiKeys = await server.services.appConnection.stripe.listApiKeys(connectionId, req.permission);

      return { apiKeys };
    }
  });
```

Add the imports `z` from `zod`, `readLimit` from `@app/server/config/rateLimiter`, `verifyAuth` from `@app/server/plugins/auth/verify-auth`, and `AuthMode` from `@app/services/auth/auth-type`, matching `supabase-connection-router.ts`.

- [ ] **Step 7: Verify**

Run: `cd backend && npm run type:check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/app-connection/ backend/src/server/routes/v1/app-connection-routers/stripe-connection-router.ts
git commit -m "feat(app-connections): list Stripe API keys without exposing secrets"
```

---

### Task 4: Rotation schemas, types and constants

**Files:**
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-constants.ts`
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-schemas.ts`
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-types.ts`
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/index.ts`
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-enums.ts`
- Modify: `backend/src/lib/api-docs/constants.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SecretRotation.StripeApiKey = "stripe-api-key"`, `STRIPE_API_KEY_PERMISSIONS` (readonly 158-name tuple), `STRIPE_API_KEY_ROTATION_LIST_OPTION`, `StripeApiKeyRotationSchema`, `CreateStripeApiKeyRotationSchema`, `UpdateStripeApiKeyRotationSchema`, `StripeApiKeyRotationGeneratedCredentialsSchema`, `StripeApiKeyRotationListItemSchema`, and the types `TStripeApiKeyRotation`, `TStripeApiKeyRotationInput`, `TStripeApiKeyRotationListItem`, `TStripeApiKeyRotationWithConnection`, `TStripeApiKeyRotationGeneratedCredentials`.

- [ ] **Step 1: Add the enum member**

In `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-enums.ts`, add to `SecretRotation`:

```ts
  StripeApiKey = "stripe-api-key"
```

This breaks every exhaustive `Record<SecretRotation, ...>` map in the codebase, which is intended. Task 6 fixes them all.

- [ ] **Step 2: Write the permission constant**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-constants.ts` starting with the permission list. Stripe has no wildcard and no endpoint that lists these, so the list is maintained by hand and was enumerated by probing each name.

```ts
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

/**
 * Every permission the Managed API Keys API accepts. There is no wildcard, no unrestricted key type
 * and no endpoint that lists these, so full access means naming all 158. Verified by probing each
 * one against a gated sandbox.
 */
export const STRIPE_API_KEY_PERMISSIONS = [
  "account_link_write",
  "adjustment_read",
  "api_key_write",
  "apple_pay_domain_read",
  "apple_pay_domain_write",
  "application_fee_read",
  "application_fee_write",
  "balance_read",
  "balance_transaction_source_read",
  "billing_analytics_meter_usage_read",
  "billing_clock_read",
  "billing_clock_write",
  "billing_intent_read",
  "billing_meter_event_read",
  "billing_meter_event_write",
  "billing_meter_read",
  "billing_meter_write",
  "billing_profile_read",
  "billing_profile_write",
  "billing_settings_read",
  "billing_settings_write",
  "capital_for_platforms_financing_offer_read",
  "capital_for_platforms_financing_offer_write",
  "capital_for_platforms_financing_summary_read",
  "capital_for_platforms_financing_transaction_read",
  "charge_read",
  "charge_write",
  "checkout_session_read",
  "checkout_session_write",
  "confirmation_token_client_read",
  "confirmation_token_client_write",
  "confirmation_token_read",
  "connected_account_read",
  "coupon_read",
  "coupon_write",
  "credit_note_read",
  "credit_note_write",
  "customer_portal_read",
  "customer_portal_write",
  "customer_read",
  "customer_session_read",
  "customer_session_write",
  "customer_write",
  "dispute_read",
  "dispute_write",
  "edit_link_write",
  "entitlement_read",
  "event_read",
  "fee_domain_resources_read",
  "file_read",
  "file_write",
  "financial_account_read",
  "inbound_transfer_read",
  "invoice_read",
  "invoice_write",
  "issuing_authorization_read",
  "issuing_authorization_write",
  "issuing_card_read",
  "issuing_card_write",
  "issuing_cardholder_read",
  "issuing_cardholder_write",
  "issuing_credit_ledger_read",
  "issuing_credit_ledger_write",
  "issuing_dispute_read",
  "issuing_dispute_write",
  "issuing_read",
  "issuing_token_network_data_read",
  "issuing_token_read",
  "issuing_token_write",
  "issuing_transaction_read",
  "issuing_transaction_write",
  "issuing_verification_write",
  "issuing_write",
  "mandate_read",
  "mandate_write",
  "order_read",
  "order_write",
  "outbound_payment_read",
  "outbound_transfer_read",
  "payment_intent_read",
  "payment_intent_write",
  "payment_links_read",
  "payment_links_write",
  "payment_method_configurations_read",
  "payment_method_configurations_write",
  "payment_method_domain_read",
  "payment_method_domain_write",
  "payment_method_read",
  "payment_method_write",
  "payment_records_read",
  "payment_records_write",
  "payout_intent_read",
  "payout_read",
  "payout_write",
  "plan_read",
  "plan_write",
  "product_catalog_import_read",
  "product_catalog_import_write",
  "product_read",
  "product_write",
  "promotion_code_read",
  "promotion_code_write",
  "provisioning_account_request_read",
  "provisioning_account_request_write",
  "provisioning_project_read",
  "provisioning_project_write",
  "provisioning_resource_read",
  "provisioning_resource_write",
  "quote_read",
  "quote_write",
  "rate_card_subscription_write",
  "rate_card_write",
  "received_credit_read",
  "received_debit_read",
  "recipient_verification_read",
  "report_runs_and_report_types_read",
  "report_runs_and_report_types_write",
  "review_read",
  "review_write",
  "secret_read",
  "secret_write",
  "setup_intent_read",
  "setup_intent_write",
  "shipping_rate_read",
  "shipping_rate_write",
  "sku_read",
  "sku_write",
  "source_read",
  "source_write",
  "subscription_read",
  "subscription_write",
  "tax_calculations_and_transactions_read",
  "tax_calculations_and_transactions_write",
  "tax_locations_read",
  "tax_locations_write",
  "tax_rate_read",
  "tax_rate_write",
  "tax_settings_read",
  "tax_settings_write",
  "terminal_configuration_read",
  "terminal_configuration_write",
  "terminal_connection_token_write",
  "terminal_location_read",
  "terminal_location_write",
  "terminal_reader_read",
  "terminal_reader_write",
  "token_read",
  "token_write",
  "top_up_read",
  "top_up_write",
  "transaction_read",
  "transfer_read",
  "transfer_write",
  "treasury_transaction_read",
  "usage_record_read",
  "usage_record_write",
  "webhook_read",
  "webhook_write"
] as const;

export const STRIPE_API_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Stripe API Key",
  type: SecretRotation.StripeApiKey,
  connection: AppConnection.Stripe,
  template: {
    secretsMapping: {
      apiKey: "STRIPE_API_KEY"
    },
    // The frontend picker reads the permission names from here. It cannot import this file, since
    // the frontend is a separate package, and Stripe has no endpoint that lists them.
    permissions: [...STRIPE_API_KEY_PERMISSIONS]
  }
};
```

- [ ] **Step 3: Write the schemas**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-schemas.ts`:

```ts
import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { STRIPE_API_KEY_PERMISSIONS } from "./stripe-api-key-rotation-constants";

export const StripeApiKeyPermissionSchema = z.enum(STRIPE_API_KEY_PERMISSIONS);

export const StripeApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    keyId: z.string(),
    apiKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const StripeApiKeyRotationParametersSchema = z.object({
  permissions: StripeApiKeyPermissionSchema.array()
    .min(1, "At least one permission is required")
    .max(STRIPE_API_KEY_PERMISSIONS.length)
    .describe(SecretRotations.PARAMETERS.STRIPE_API_KEY.permissions),
  connectPermissions: StripeApiKeyPermissionSchema.array()
    .max(STRIPE_API_KEY_PERMISSIONS.length)
    .optional()
    .describe(SecretRotations.PARAMETERS.STRIPE_API_KEY.connectPermissions)
});

const StripeApiKeyRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.STRIPE_API_KEY.apiKey)
});

export const StripeApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  }),
  permissions: z.string().array()
});

export const StripeApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.StripeApiKey).extend({
  type: z.literal(SecretRotation.StripeApiKey),
  parameters: StripeApiKeyRotationParametersSchema,
  secretsMapping: StripeApiKeyRotationSecretsMappingSchema
});

export const CreateStripeApiKeyRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.StripeApiKey).extend({
  parameters: StripeApiKeyRotationParametersSchema,
  secretsMapping: StripeApiKeyRotationSecretsMappingSchema
});

export const UpdateStripeApiKeyRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.StripeApiKey).extend({
  parameters: StripeApiKeyRotationParametersSchema.optional(),
  secretsMapping: StripeApiKeyRotationSecretsMappingSchema.optional()
});

export const StripeApiKeyRotationListItemSchema = z.object({
  name: z.literal("Stripe API Key"),
  connection: z.literal(AppConnection.Stripe),
  type: z.literal(SecretRotation.StripeApiKey),
  template: StripeApiKeyRotationTemplateSchema
});
```

- [ ] **Step 4: Write the types**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-types.ts`:

```ts
import { z } from "zod";

import { TStripeConnection } from "@app/services/app-connection/stripe";

import { TStripeSecretKeyField } from "./stripe-api-key-jwe";
import {
  CreateStripeApiKeyRotationSchema,
  StripeApiKeyRotationGeneratedCredentialsSchema,
  StripeApiKeyRotationListItemSchema,
  StripeApiKeyRotationSchema
} from "./stripe-api-key-rotation-schemas";

export type TStripeApiKeyRotation = z.infer<typeof StripeApiKeyRotationSchema>;

export type TStripeApiKeyRotationInput = z.infer<typeof CreateStripeApiKeyRotationSchema>;

export type TStripeApiKeyRotationListItem = z.infer<typeof StripeApiKeyRotationListItemSchema>;

export type TStripeApiKeyRotationWithConnection = TStripeApiKeyRotation & {
  connection: TStripeConnection;
};

export type TStripeApiKeyRotationGeneratedCredentials = z.infer<
  typeof StripeApiKeyRotationGeneratedCredentialsSchema
>;

export type TStripeApiKeyCreateResponse = {
  id?: string;
  secret_key?: TStripeSecretKeyField;
};
```

- [ ] **Step 5: Write the barrel**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/index.ts`:

```ts
export * from "./stripe-api-key-rotation-constants";
export * from "./stripe-api-key-rotation-schemas";
export * from "./stripe-api-key-rotation-types";
```

- [ ] **Step 6: Add the API docs strings**

In `backend/src/lib/api-docs/constants.ts`, add to `SecretRotations.PARAMETERS`:

```ts
    STRIPE_API_KEY: {
      permissions:
        "The permissions granted to the generated Stripe API key. Stripe has no wildcard permission, so this is the full list of what the key may do.",
      connectPermissions:
        "The permissions the generated Stripe API key has over connected accounts. Only meaningful when the account is a Connect platform."
    },
```

and to `SecretRotations.SECRETS_MAPPING`:

```ts
    STRIPE_API_KEY: {
      apiKey: "The name of the secret that the rotated Stripe API key will be mapped to."
    },
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/ee/services/secret-rotation-v2/ backend/src/lib/api-docs/constants.ts
git commit -m "feat(secret-rotation): add Stripe API key rotation schemas"
```

Type checking will still fail at this point because the exhaustive maps do not yet have a Stripe arm. Task 6 closes that.

---

### Task 5: The rotation factory

**Files:**
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-fns.ts`
- Create: `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-fns.test.ts`

**Interfaces:**
- Consumes: `generateStripeEncryptionKeyPair`, `readStripeSecret` (Task 2); `STRIPE_API_KEYS_URL`, `getStripePlatformRequestConfig`, `getStripeMerchantRequestConfig`, `withIdempotencyKey`, `getStripeErrorMessage`, `getStripeErrorStatus`, `throwStripeApiKeyManagementError` (Task 1); the types from Task 4.
- Produces: `stripeApiKeyRotationFactory`, matching `TRotationFactory<TStripeApiKeyRotationWithConnection, TStripeApiKeyRotationGeneratedCredentials>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-fns.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_platform" })
}));
vi.mock("@app/lib/config/request", () => ({
  request: {
    get: (...args: unknown[]) => (getMock as any)(...args),
    post: (...args: unknown[]) => (postMock as any)(...args)
  }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { stripeApiKeyRotationFactory } from "./stripe-api-key-rotation-fns";

const httpError = (status: number, message = "boom") =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as any,
    data: { error: { message } }
  });

const makeFactory = () =>
  stripeApiKeyRotationFactory(
    {
      connection: { id: "connection-id", credentials: { accountId: "acct_123" } },
      parameters: { permissions: ["customer_read"], connectPermissions: [] },
      secretsMapping: { apiKey: "STRIPE_API_KEY" }
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

const isCreate = (url: string) => url.endsWith("/v2/iam/api_keys");
const isExpire = (url: string) => url.endsWith("/expire");
const expireCalls = (keyId?: string) =>
  postMock.mock.calls.filter(
    ([url]) => isExpire(url) && (keyId === undefined || url.includes(`/${keyId}/expire`))
  );

/** Test mode returns the secret in plaintext, which is the shape the sandbox produces. */
const mockStripe = ({
  createIds = ["mk_new"],
  expire = async () => ({ data: {} })
}: { createIds?: string[]; expire?: (keyId: string) => Promise<unknown> } = {}) => {
  const ids = [...createIds];
  postMock.mockImplementation(async (url: string) => {
    if (isCreate(url)) {
      const id = ids.shift() ?? "mk_extra";
      return { data: { id, secret_key: { token: `rk_test_${id}` } } };
    }
    if (isExpire(url)) return expire(url.split("/").slice(-2)[0]);
    throw new Error(`unexpected request to ${url}`);
  });
};

describe("stripeApiKeyRotationFactory", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it("mints a key and hands the plaintext secret to the callback", async () => {
    mockStripe();
    const callback = vi.fn(async (credentials: unknown) => credentials);

    const result = await makeFactory().issueCredentials(callback as any);

    expect(result).toEqual({ keyId: "mk_new", apiKey: "rk_test_mk_new" });
    const [, body] = postMock.mock.calls.find(([url]) => isCreate(url))!;
    expect(body.type).toBe("secret_key");
    expect(body.permissions).toEqual(["customer_read"]);
    expect(body.public_key.pem_key.data).toContain("BEGIN PUBLIC KEY");
  });

  it("expires the new key when the create commit fails", async () => {
    mockStripe();
    const callback = vi.fn(async () => {
      throw new Error("conflicting secret");
    });

    await expect(makeFactory().issueCredentials(callback as any)).rejects.toThrow("conflicting secret");
    expect(expireCalls("mk_new")).toHaveLength(1);
  });

  it("retires the previous key before committing the new one", async () => {
    mockStripe({ createIds: ["mk_new"] });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await makeFactory().rotateCredentials({ keyId: "mk_old", apiKey: "rk_old" } as any, callback as any, {} as any);

    const order = postMock.mock.calls.map(([url]) => (isCreate(url) ? "create" : url.split("/").slice(-2)[0]));
    expect(order).toEqual(["create", "mk_old"]);
    expect(callback).toHaveBeenCalledWith({ keyId: "mk_new", apiKey: "rk_test_mk_new" });
  });

  it("cleans up the new key and fails when the retirement fails", async () => {
    mockStripe({
      expire: async (keyId) => {
        if (keyId === "mk_old") throw httpError(500, "Stripe is down");
        return { data: {} };
      }
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await expect(
      makeFactory().rotateCredentials({ keyId: "mk_old" } as any, callback as any, {} as any)
    ).rejects.toThrow("Stripe is down");

    expect(expireCalls("mk_new")).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("names the stranded key when the cleanup also fails", async () => {
    mockStripe({
      expire: async () => {
        throw httpError(500, "Stripe is down");
      }
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await expect(
      makeFactory().rotateCredentials({ keyId: "mk_old" } as any, callback as any, {} as any)
    ).rejects.toThrow(/mk_new/);
  });

  it("treats a 404 on expire as already gone", async () => {
    mockStripe({
      expire: async (keyId) => {
        if (keyId === "mk_old") throw httpError(404, "No such key");
        return { data: {} };
      }
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await expect(
      makeFactory().rotateCredentials({ keyId: "mk_old" } as any, callback as any, {} as any)
    ).resolves.toBeDefined();
  });

  it("maps only the API key into the secrets payload", () => {
    expect(makeFactory().getSecretsPayload({ keyId: "mk_new", apiKey: "rk_test" } as any)).toEqual([
      { key: "STRIPE_API_KEY", value: "rk_test" }
    ]);
  });

  it("treats 403 as a live key and 401 as a dead one", async () => {
    getMock.mockRejectedValueOnce(httpError(403, "Insufficient permissions"));
    await expect(
      makeFactory().checkActiveCredentials!({ keyId: "mk", apiKey: "rk_test" } as any)
    ).resolves.toBeUndefined();

    getMock.mockRejectedValueOnce(httpError(401, "Invalid API Key"));
    await expect(
      makeFactory().checkActiveCredentials!({ keyId: "mk", apiKey: "rk_test" } as any)
    ).rejects.toThrow("Invalid API Key");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `make test-api-unit SPEC=stripe-api-key-rotation-fns`
Expected: FAIL, cannot resolve `./stripe-api-key-rotation-fns`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/ee/services/secret-rotation-v2/stripe-api-key/stripe-api-key-rotation-fns.ts`:

```ts
import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import {
  getStripeErrorMessage,
  getStripeErrorStatus,
  getStripeMerchantRequestConfig,
  getStripePlatformRequestConfig,
  STRIPE_API_KEYS_URL,
  throwStripeApiKeyManagementError,
  withIdempotencyKey
} from "@app/services/app-connection/stripe/stripe-connection-public-client";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { generateStripeEncryptionKeyPair, readStripeSecret } from "./stripe-api-key-jwe";
import {
  TStripeApiKeyCreateResponse,
  TStripeApiKeyRotationGeneratedCredentials,
  TStripeApiKeyRotationWithConnection
} from "./stripe-api-key-rotation-types";

const STRIPE_KEY_NAME_MAX_LENGTH = 100;

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unknown error");

export const stripeApiKeyRotationFactory: TRotationFactory<
  TStripeApiKeyRotationWithConnection,
  TStripeApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { permissions, connectPermissions },
    secretsMapping
  } = secretRotation;

  const { accountId } = connection.credentials;

  // The factory is built without an id at create time, so the name comes from the mapped secret.
  // It is what makes a key stranded by a timed-out create identifiable in the Stripe dashboard.
  const $keyName = () => `infisical-${secretsMapping.apiKey}-${Date.now()}`.slice(0, STRIPE_KEY_NAME_MAX_LENGTH);

  const $createApiKey = async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();

    let data: TStripeApiKeyCreateResponse;

    try {
      ({ data } = await request.post<TStripeApiKeyCreateResponse>(
        STRIPE_API_KEYS_URL,
        {
          type: "secret_key",
          name: $keyName(),
          permissions,
          ...(connectPermissions?.length ? { connect_permissions: connectPermissions } : {}),
          public_key: { pem_key: { data: publicKey, algorithm: "RSA" } }
        },
        withIdempotencyKey(getStripePlatformRequestConfig(accountId))
      ));
    } catch (error) {
      return throwStripeApiKeyManagementError(accountId, error);
    }

    if (!data?.id) {
      throw new BadRequestError({ message: "Stripe did not return an ID for the created API key." });
    }

    return { keyId: data.id, apiKey: readStripeSecret(data.secret_key, privateKey) };
  };

  /**
   * Expire is the whole retirement. Stripe decides when it takes effect, so nothing here claims the
   * key is dead. Narrowing the key's permissions first would stop it sooner, and was measured
   * working, but is deliberately not in v1. See the design doc.
   */
  const $retireKey = async (keyId: string) => {
    try {
      await request.post(
        `${STRIPE_API_KEYS_URL}/${keyId}/expire`,
        {},
        withIdempotencyKey(getStripePlatformRequestConfig(accountId))
      );
    } catch (error) {
      if (getStripeErrorStatus(error) === 404) return;

      throwStripeApiKeyManagementError(accountId, error);
    }
  };

  /** A key exists in Stripe before the row does, so a failed commit has to take the key with it. */
  const $commitOrCleanUp = async <T>(
    credentials: { keyId: string; apiKey: string },
    callback: (credentials: { keyId: string; apiKey: string }) => Promise<T>
  ): Promise<T> => {
    try {
      return await callback(credentials);
    } catch (commitError) {
      try {
        await $retireKey(credentials.keyId);
      } catch (cleanupError) {
        throw new BadRequestError({
          message: `${getErrorMessage(commitError)} The newly created Stripe API key ${credentials.keyId} could not be expired and may need to be removed manually: ${getErrorMessage(cleanupError)}`
        });
      }

      throw commitError;
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TStripeApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();

    return $commitOrCleanUp(credentials, callback);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TStripeApiKeyRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    for (const { keyId } of credentials) {
      // eslint-disable-next-line no-await-in-loop
      await $retireKey(keyId);
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TStripeApiKeyRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const newCredentials = await $createApiKey();

    // Retire before committing, so a failure leaves Postgres and Stripe agreeing with each other and
    // the key we just minted gets cleaned up rather than orphaned across BullMQ's retries.
    if (credentialsToRevoke?.keyId) {
      try {
        await $retireKey(credentialsToRevoke.keyId);
      } catch (retireError) {
        try {
          await $retireKey(newCredentials.keyId);
        } catch (cleanupError) {
          throw new BadRequestError({
            message: `${getErrorMessage(retireError)} The newly created Stripe API key ${newCredentials.keyId} could not be expired and may need to be removed manually: ${getErrorMessage(cleanupError)}`
          });
        }

        throw retireError;
      }
    }

    return $commitOrCleanUp(newCredentials, callback);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TStripeApiKeyRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TStripeApiKeyRotationGeneratedCredentials
  > = async ({ apiKey }) => {
    try {
      await request.get(`${IntegrationUrls.STRIPE_API_URL}/v1/customers?limit=1`, getStripeMerchantRequestConfig(apiKey));
    } catch (error) {
      // 403 means the key authenticated and simply lacks customer_read, which is a healthy narrow
      // key. Only 401 means the key is gone.
      if (getStripeErrorStatus(error) === 403) return;

      throw new BadRequestError({
        message: `Stripe API key verification failed: ${getStripeErrorMessage(error)}`
      });
    }
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `make test-api-unit SPEC=stripe-api-key-rotation-fns`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ee/services/secret-rotation-v2/stripe-api-key/
git commit -m "feat(secret-rotation): add Stripe API key rotation factory"
```

---

### Task 6: Backend wiring

Closes every map, union and router the new enum member broke, plus the ones the compiler will not catch.

**Files:**
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-maps.ts`
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-fns.ts`
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-service.ts`
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-types.ts`
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-union-schema.ts`
- Create: `backend/src/ee/routes/v2/secret-rotation-v2-routers/stripe-api-key-rotation-router.ts`
- Modify: `backend/src/ee/routes/v2/secret-rotation-v2-routers/index.ts`
- Modify: `backend/src/ee/routes/v2/secret-rotation-v2-routers/secret-rotation-v2-router.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5.
- Produces: a registered, reachable set of `/secret-rotations/stripe-api-key` endpoints.

- [ ] **Step 1: Let the compiler list the work**

Run: `cd backend && npm run type:check`
Expected: FAIL, with an error per exhaustive map missing a `SecretRotation.StripeApiKey` arm. Keep this output, it is the checklist for step 2.

- [ ] **Step 2: Add the compiler-enforced arms**

In `secret-rotation-v2-maps.ts`:

```ts
  [SecretRotation.StripeApiKey]: "Stripe API Key",
```
in `SECRET_ROTATION_NAME_MAP`, and

```ts
  [SecretRotation.StripeApiKey]: AppConnection.Stripe,
```
in `SECRET_ROTATION_CONNECTION_MAP`.

In `secret-rotation-v2-fns.ts`, import `STRIPE_API_KEY_ROTATION_LIST_OPTION` from `./stripe-api-key` and add:

```ts
  [SecretRotation.StripeApiKey]: STRIPE_API_KEY_ROTATION_LIST_OPTION,
```

In `secret-rotation-v2-service.ts`, import `stripeApiKeyRotationFactory` from `./stripe-api-key/stripe-api-key-rotation-fns` and add to `SECRET_ROTATION_FACTORY_MAP`:

```ts
  [SecretRotation.StripeApiKey]: stripeApiKeyRotationFactory as TRotationFactoryImplementation,
```

Match the casting style of the neighbouring entries exactly.

- [ ] **Step 3: Add the arms the compiler will not catch**

In `secret-rotation-v2-types.ts`, add `TStripeApiKeyRotation`, `TStripeApiKeyRotationInput`, `TStripeApiKeyRotationListItem`, `TStripeApiKeyRotationWithConnection` and `TStripeApiKeyRotationGeneratedCredentials` to the five corresponding union types, importing them from `./stripe-api-key`.

In `secret-rotation-v2-union-schema.ts`, import `StripeApiKeyRotationSchema` from `./stripe-api-key` and add it to the `z.discriminatedUnion("type", [...])` array.

In `secret-rotation-v2-router.ts`, add `StripeApiKeyRotationListItemSchema` to the list-item schema union.

These are array members rather than object keys, so nothing fails to compile when one is missed. Confirm each by grepping for a neighbour, for example `grep -n CloudflareApiTokenRotationSchema backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-union-schema.ts`.

- [ ] **Step 4: Add the router**

Create `backend/src/ee/routes/v2/secret-rotation-v2-routers/stripe-api-key-rotation-router.ts`:

```ts
import {
  CreateStripeApiKeyRotationSchema,
  StripeApiKeyRotationGeneratedCredentialsSchema,
  StripeApiKeyRotationSchema,
  UpdateStripeApiKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/stripe-api-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerStripeApiKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.StripeApiKey,
    server,
    responseSchema: StripeApiKeyRotationSchema,
    createSchema: CreateStripeApiKeyRotationSchema,
    updateSchema: UpdateStripeApiKeyRotationSchema,
    generatedCredentialsSchema: StripeApiKeyRotationGeneratedCredentialsSchema
  });
```

Export it from `secret-rotation-v2-routers/index.ts` and add it to the router map there, following the `CloudflareApiToken` entry.

- [ ] **Step 5: Verify**

Run: `cd backend && npm run type:check`
Expected: no errors.

Run: `make test-api-unit SPEC=stripe`
Expected: PASS, all three Stripe spec files.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ee/
git commit -m "feat(secret-rotation): wire Stripe API key rotation"
```

---

### Task 7: Frontend API layer

**Files:**
- Create: `frontend/src/hooks/api/appConnections/stripe/queries.tsx`
- Create: `frontend/src/hooks/api/appConnections/stripe/types.ts`
- Create: `frontend/src/hooks/api/appConnections/stripe/index.ts`
- Create: `frontend/src/hooks/api/secretRotationsV2/types/stripe-api-key-rotation.ts`
- Modify: `frontend/src/hooks/api/secretRotationsV2/enums.ts`
- Modify: `frontend/src/hooks/api/secretRotationsV2/types/index.ts`
- Modify: `frontend/src/helpers/secretRotationsV2.ts`

**Interfaces:**
- Consumes: the `/api/v1/app-connections/stripe/:connectionId/api-keys` route from Task 3.
- Produces: `useStripeConnectionListApiKeys(connectionId, options)`, `TStripeApiKey`, `TStripeApiKeyRotation`, `TStripeApiKeyRotationGeneratedCredentialsResponse`, `TStripeApiKeyRotationOption`, and `SecretRotation.StripeApiKey`.

- [ ] **Step 1: Add the enum member and helper map entries**

In `frontend/src/hooks/api/secretRotationsV2/enums.ts`, add `StripeApiKey = "stripe-api-key"` to `SecretRotation`.

In `frontend/src/helpers/secretRotationsV2.ts`, add the arm to every `Record<SecretRotation, ...>`:

```ts
  [SecretRotation.StripeApiKey]: "Stripe API Key",
```
in the name map,

```ts
  [SecretRotation.StripeApiKey]: "Stripe.svg",
```
in the image map. Confirm the filename with `ls frontend/public/images/integrations | grep -i stripe`, since neighbouring entries use `.png` and Stripe's asset is an svg.

```ts
  [SecretRotation.StripeApiKey]: AppConnection.Stripe,
```
in the connection map, and

```ts
  [SecretRotation.StripeApiKey]: true,
```
in `IS_ROTATION_DUAL_CREDENTIALS`, because Stripe rotation is create-then-retire and keeps two live keys.

- [ ] **Step 2: Add the connection query hook**

Create `frontend/src/hooks/api/appConnections/stripe/types.ts`:

```ts
export type TStripeApiKey = {
  id: string;
  name: string;
  status: string;
  permissions: string[];
  connectPermissions: string[];
};
```

Create `frontend/src/hooks/api/appConnections/stripe/queries.tsx`, following `appConnections/supabase/queries.tsx`:

```tsx
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TStripeApiKey } from "./types";

const stripeConnectionKeys = {
  all: [...appConnectionKeys.all, "stripe"] as const,
  listApiKeys: (connectionId: string) => [...stripeConnectionKeys.all, "api-keys", connectionId] as const
};

export const useStripeConnectionListApiKeys = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TStripeApiKey[],
      unknown,
      TStripeApiKey[],
      ReturnType<typeof stripeConnectionKeys.listApiKeys>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: stripeConnectionKeys.listApiKeys(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ apiKeys: TStripeApiKey[] }>(
        `/api/v1/app-connections/stripe/${connectionId}/api-keys`
      );

      return data.apiKeys;
    },
    ...options
  });
};
```

Create `frontend/src/hooks/api/appConnections/stripe/index.ts` re-exporting both, matching the supabase barrel.

- [ ] **Step 3: Add the rotation types**

Create `frontend/src/hooks/api/secretRotationsV2/types/stripe-api-key-rotation.ts`:

```ts
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TStripeApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.StripeApiKey;
  parameters: {
    permissions: string[];
    connectPermissions?: string[];
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TStripeApiKeyRotationGeneratedCredentials = {
  keyId: string;
  apiKey: string;
};

export type TStripeApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.StripeApiKey,
    TStripeApiKeyRotationGeneratedCredentials
  >;

export type TStripeApiKeyRotationOption = {
  name: string;
  type: SecretRotation.StripeApiKey;
  connection: AppConnection.Stripe;
  template: {
    secretsMapping: TStripeApiKeyRotation["secretsMapping"];
    permissions: string[];
  };
};
```

Add the re-export and the union members in `frontend/src/hooks/api/secretRotationsV2/types/index.ts`, following the `cloudflare-api-token-rotation` entries.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run type:check`
Expected: errors only about the missing form components, which Task 8 adds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/api/ frontend/src/helpers/secretRotationsV2.ts
git commit -m "feat(secret-rotation): add Stripe API key rotation API types"
```

---

### Task 8: Frontend form

**Files:**
- Create: `frontend/src/components/secret-rotations-v2/forms/schemas/stripe-api-key-rotation-schema.ts`
- Modify: `frontend/src/components/secret-rotations-v2/forms/schemas/index.ts`
- Create: `frontend/src/components/secret-rotations-v2/forms/SecretRotationV2ParametersFields/StripeApiKeyRotationParametersFields.tsx`
- Create: `frontend/src/components/secret-rotations-v2/forms/SecretRotationV2ReviewFields/StripeApiKeyRotationReviewFields.tsx`
- Create: `frontend/src/components/secret-rotations-v2/forms/SecretRotationV2SecretsMappingFields/StripeApiKeyRotationSecretsMappingFields.tsx`
- Create: `frontend/src/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewStripeApiKeyRotationGeneratedCredentials.tsx`
- Modify: the four registry files that switch on rotation type

**Interfaces:**
- Consumes: `useStripeConnectionListApiKeys`, `TStripeApiKeyRotation` (Task 7); `rotationOption.template.permissions` served by the backend list-options endpoint (Task 4).
- Produces: a working create and edit form for the rotation.

- [ ] **Step 1: Write the form schema**

Create `frontend/src/components/secret-rotations-v2/forms/schemas/stripe-api-key-rotation-schema.ts`:

```ts
import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const StripeApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.StripeApiKey),
    parameters: z.object({
      permissions: z
        .string()
        .trim()
        .array()
        .min(1, "At least one permission is required"),
      connectPermissions: z.string().trim().array().optional()
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
```

Add it to the union in `forms/schemas/index.ts`, following the `CloudflareApiTokenRotationSchema` entry.

- [ ] **Step 2: Write the parameters fields**

Create `StripeApiKeyRotationParametersFields.tsx`. The permission picker is a v3 `Combobox` with `multiple` and `isSelectAll`. Do not build a new component: `ComboboxSelectAll` is internal, and `isSelectAll` is the supported API. Select-all covers only the options matching the current search, which is why the label says "Select all matching".

```tsx
import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Button, Combobox, Field, FieldError, FieldLabel } from "@app/components/v3";
import { useStripeConnectionListApiKeys } from "@app/hooks/api/appConnections/stripe";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";

export const StripeApiKeyRotationParametersFields = () => {
  const { control, setValue } = useFormContext<
    TSecretRotationV2Form & { type: SecretRotation.StripeApiKey }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });
  const { rotationOption } = useSecretRotationV2Option(SecretRotation.StripeApiKey);
  const { data: apiKeys = [] } = useStripeConnectionListApiKeys(connectionId, {
    enabled: Boolean(connectionId)
  });

  const permissions = useMemo(() => rotationOption?.template.permissions ?? [], [rotationOption]);

  return (
    <>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="stripe-permissions">Permissions</FieldLabel>
            <Combobox
              id="stripe-permissions"
              multiple
              isSelectAll
              options={permissions}
              value={value ?? []}
              onValueChange={onChange}
              getOptionValue={(permission) => permission}
              getOptionLabel={(permission) => permission}
              placeholder="Select permissions..."
              searchPlaceholder="Search permissions..."
              searchAriaLabel="Search Stripe permissions"
              clearAriaLabel="Clear all permissions"
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="parameters.permissions"
      />
      {apiKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-mineshaft-300">Copy permissions from an existing key:</span>
          {apiKeys.map((apiKey) => (
            <Button
              key={apiKey.id}
              size="xs"
              variant="outline_bg"
              onClick={() => {
                setValue("parameters.permissions", apiKey.permissions, { shouldDirty: true });
                setValue("parameters.connectPermissions", apiKey.connectPermissions, {
                  shouldDirty: true
                });
              }}
            >
              {apiKey.name || apiKey.id}
            </Button>
          ))}
        </div>
      )}
    </>
  );
};
```

Check the exact `Button` variant and text colour class against a neighbouring v3 form before committing, and adjust to match. `DESIGN.md` governs here.

- [ ] **Step 3: Write the remaining three components**

`StripeApiKeyRotationSecretsMappingFields.tsx`: copy `CloudflareApiTokenRotationSecretsMappingFields.tsx` and reduce it to a single item, `name: "API Key"`, bound to `secretsMapping.apiKey` with placeholder `rotationOption?.template.secretsMapping.apiKey`.

`StripeApiKeyRotationReviewFields.tsx`: follow `CloudflareApiTokenRotationReviewFields.tsx`, showing the permission count and the first few names rather than all 158.

`ViewStripeApiKeyRotationGeneratedCredentials.tsx`: copy `ViewCloudflareApiTokenRotationGeneratedCredentials.tsx`, replacing the two credential displays with `<CredentialDisplay label="Key ID">{...keyId}</CredentialDisplay>` and `<CredentialDisplay isSensitive label="API Key">{...apiKey}</CredentialDisplay>`.

- [ ] **Step 4: Register all four**

Add a `case SecretRotation.StripeApiKey:` arm to each of `SecretRotationV2ParametersFields.tsx`, `SecretRotationReviewFields.tsx`, `SecretRotationV2SecretsMappingFields.tsx` and `ViewSecretRotationV2GeneratedCredentials.tsx`.

- [ ] **Step 5: Verify**

Run: `make reviewable-ui`
Expected: lint and type check both clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/secret-rotations-v2/
git commit -m "feat(secret-rotation): add Stripe API key rotation form"
```

---

### Task 9: Documentation

**Files:**
- Create: `docs/documentation/platform/secret-rotation/stripe-api-key.mdx`
- Create: `docs/integrations/app-connections/stripe.mdx`
- Create: eight pages under `docs/api-reference/endpoints/secret-rotations/stripe-api-key/`
- Modify: `docs/docs.json`
- Modify: `docs/snippets/RotationsBrowser.jsx`

- [ ] **Step 1: Load the docs skill**

Invoke the `docs-style` skill. It carries the procedure for `docs/STYLE_GUIDE.md`, which is required for anything under `docs/`.

- [ ] **Step 2: Write the rotation page**

Copy the structure of `docs/documentation/platform/secret-rotation/cloudflare-api-token.mdx`. Four things must be stated plainly, because each is a support ticket otherwise:

- The minted key's mode follows the instance's Stripe key, so a test-mode instance mints test keys. There is no per-rotation choice.
- Infisical never touches keys it did not create. The user's original key stays live until they expire it themselves, once their applications have picked up the rotated secret.
- Retirement expires the key, and Stripe decides when that takes effect, so a retired key may keep answering briefly. Do not write anything that claims the key is dead.
- The rotated value is an `rk_` restricted key, not an `sk_` secret key, so anything asserting on the prefix will break.

- [ ] **Step 3: Write the connection page and API reference**

`docs/integrations/app-connections/stripe.mdx` was left outstanding by the connection PR. Base it on `stripe-app/README.md` for the setup sequence, and on `docs/integrations/app-connections/cloudflare.mdx` for structure.

The eight API reference pages mirror `docs/api-reference/endpoints/secret-rotations/cloudflare-api-token/`: create, delete, get-by-id, get-by-name, get-generated-credentials-by-id, list, rotate-secrets, update. Register every new page in `docs/docs.json` and add the rotation to `docs/snippets/RotationsBrowser.jsx`.

- [ ] **Step 4: Verify**

Run: `make lint-docs-branch`
Expected: exit 0. Read the printed output rather than trusting the exit code: `Infisical.UIActions` and `Infisical.Contractions` report below error level and never fail the run. Vale also cannot see prose indented four or more spaces inside Mintlify components, so a clean run is not evidence that nested content was checked.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(secret-rotation): document Stripe API key rotation"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run the full backend gate**

Run: `make reviewable-api`
Expected: lint and type check clean.

- [ ] **Step 2: Run the full frontend gate**

Run: `make reviewable-ui`
Expected: lint and type check clean.

- [ ] **Step 3: Run the unit suite**

Run: `make test-api-unit`
Expected: PASS. This runs under `--force-fips`, which is what makes the JWE test meaningful.

- [ ] **Step 4: Check against the code quality guide**

Re-read `backend/CODE_QUALITY.md` and check this change against it. The sections that bite here are third-party pagination, transaction and connection-pool discipline, input validation, and user-facing error messages.

- [ ] **Step 5: Manual verification against the sandbox**

The gated sandbox is the only way to exercise the real API, and it is test mode, so it cannot verify the live-mode JWE path. Record the results in the PR:

- Create a rotation and confirm a key appears in the Stripe dashboard named `infisical-<secret name>-<timestamp>`.
- Confirm the mapped secret holds an `rk_` value that authenticates.
- Rotate twice and confirm the first key is expired while the second stays live.
- Delete the rotation with revoke and confirm both keys expire.
- Confirm the form's "copy from an existing key" prefill populates the permission picker.
- In the browser devtools network tab, confirm the `api-keys` response contains no `secret_key` field.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore(secret-rotation): address review gate findings"
```

---

## Still open after this plan

Live mode is unverified and cannot be verified from the sandbox. Everything about the encrypted path is asserted: that create accepts `public_key`, that the response carries `secret_key.encrypted_secret.ciphertext`, that `alg` is `RSA-OAEP` or `RSA-OAEP-256`, and that `enc` is `A256GCM`. The design rejects anything else by name, so a surprise there fails in production and nowhere earlier. The unit tests cannot catch it, because they decrypt what they themselves encrypted.

This needs a live-mode account with the Managed API Keys API gated on, which has lead time. It should be in flight before this work merges, not after.
