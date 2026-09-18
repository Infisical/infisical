import crypto from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { crypto as infisicalCrypto } from "@app/lib/crypto";

import { validateIamIdentity, validateIdTokenIdentity } from "./identity-gcp-auth-fns";

const { getFederatedSignonCerts, verifySignedJwtWithCertsAsync, requestGet } = vi.hoisted(() => ({
  getFederatedSignonCerts: vi.fn(),
  verifySignedJwtWithCertsAsync: vi.fn(),
  requestGet: vi.fn()
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(() => ({
    getFederatedSignonCerts,
    verifySignedJwtWithCertsAsync
  }))
}));

vi.mock("@app/lib/config/request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/config/request")>();
  return { ...actual, request: { ...actual.request, get: requestGet } };
});

const IDENTITY_ID = "bc2d5b6c-1f0a-4f7d-9a9f-1c19d8f0b111";
const SERVICE_ACCOUNT = "test-sa@my-project.iam.gserviceaccount.com";
const KEY_ID = "d0f1e2a3b4c5";

const generateRsaKeyPair = () =>
  crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

let signingKeyPair: ReturnType<typeof generateRsaKeyPair>;
let otherKeyPair: ReturnType<typeof generateRsaKeyPair>;
let previousFipsEnabled: string | undefined;

const signIamJwt = ({
  privateKey = signingKeyPair.privateKey,
  payload = { sub: SERVICE_ACCOUNT, aud: IDENTITY_ID },
  omitKid = false,
  expiresIn = "1h"
}: {
  privateKey?: string;
  payload?: Record<string, unknown>;
  omitKid?: boolean;
  expiresIn?: string;
} = {}) =>
  infisicalCrypto.jwt().sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn,
    ...(omitKid ? {} : { keyid: KEY_ID })
  });

beforeAll(async () => {
  previousFipsEnabled = process.env.FIPS_ENABLED;
  process.env.FIPS_ENABLED = "false";
  await infisicalCrypto.initialize({} as never, {} as never, {} as never);
  signingKeyPair = generateRsaKeyPair();
  otherKeyPair = generateRsaKeyPair();
});

afterAll(() => {
  if (previousFipsEnabled === undefined) {
    delete process.env.FIPS_ENABLED;
  } else {
    process.env.FIPS_ENABLED = previousFipsEnabled;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateIdTokenIdentity", () => {
  beforeEach(() => {
    getFederatedSignonCerts.mockResolvedValue({ certs: { "cert-kid": "cert-value" } });
  });

  const computeEngine = {
    instance_creation_timestamp: 1700000000,
    instance_id: "3802628075545820873",
    instance_name: "test-instance",
    project_id: "my-project",
    project_number: 123456789,
    zone: "us-central1-a"
  };

  const mockPayload = (payload: unknown) => {
    verifySignedJwtWithCertsAsync.mockResolvedValue({ getPayload: () => payload });
  };

  test("returns the email and Compute Engine details for a GCE token", async () => {
    mockPayload({ email: SERVICE_ACCOUNT, google: { compute_engine: computeEngine } });

    await expect(validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "id-token" })).resolves.toEqual({
      email: SERVICE_ACCOUNT,
      computeEngineDetails: computeEngine
    });
  });

  test("verifies the token against the identity ID as audience and the Google issuer", async () => {
    mockPayload({ email: SERVICE_ACCOUNT, google: { compute_engine: computeEngine } });

    await validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "id-token" });

    expect(verifySignedJwtWithCertsAsync).toHaveBeenCalledWith("id-token", { "cert-kid": "cert-value" }, IDENTITY_ID, [
      "https://accounts.google.com"
    ]);
  });

  // A token minted outside a GCE instance (for example by a service account key) verifies
  // fine but carries no google.compute_engine claim. The service, not this function, decides
  // whether that is allowed.
  test("returns undefined Compute Engine details when the token carries no GCE claim", async () => {
    mockPayload({ email: SERVICE_ACCOUNT });

    await expect(validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "id-token" })).resolves.toEqual({
      email: SERVICE_ACCOUNT,
      computeEngineDetails: undefined
    });
  });

  test("rejects a token that fails signature or audience verification", async () => {
    verifySignedJwtWithCertsAsync.mockRejectedValue(new Error("Wrong recipient, payload audience != requiredAudience"));

    await expect(validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "id-token" })).rejects.toThrow(
      "Invalid GCP ID token"
    );
  });

  // google-auth-library embeds the full token in its error messages, so the cause must not
  // ride along into a logged error.
  test("does not leak the token in the rejection", async () => {
    verifySignedJwtWithCertsAsync.mockRejectedValue(new Error("Invalid token signature: super-secret-token"));

    await expect(validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "super-secret-token" })).rejects.toSatisfy(
      (error: Error) => !JSON.stringify({ message: error.message, cause: error.cause }).includes("super-secret-token")
    );
  });

  test("rejects a token with no payload", async () => {
    mockPayload(undefined);

    await expect(validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "id-token" })).rejects.toThrow(
      "GCP ID token is missing an email claim"
    );
  });

  test("rejects a token with no email claim", async () => {
    mockPayload({ google: { compute_engine: computeEngine } });

    await expect(validateIdTokenIdentity({ identityId: IDENTITY_ID, jwt: "id-token" })).rejects.toThrow(
      "GCP ID token is missing an email claim"
    );
  });
});

describe("validateIamIdentity", () => {
  beforeEach(() => {
    requestGet.mockResolvedValue({ data: { [KEY_ID]: signingKeyPair.publicKey } });
  });

  test("returns the service account email for a correctly signed token", async () => {
    await expect(validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt() })).resolves.toEqual({
      email: SERVICE_ACCOUNT
    });
  });

  test("fetches the signing keys for the service account named in the token", async () => {
    await validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt() });

    expect(requestGet).toHaveBeenCalledWith(
      `https://www.googleapis.com/service_accounts/v1/metadata/x509/${encodeURIComponent(SERVICE_ACCOUNT)}`
    );
  });

  test("rejects a malformed token", async () => {
    await expect(validateIamIdentity({ identityId: IDENTITY_ID, jwt: "not-a-jwt" })).rejects.toThrow(
      "Invalid GCP IAM token"
    );
    expect(requestGet).not.toHaveBeenCalled();
  });

  // Without a kid there is no way to pick a signing key, and indexing the key map with
  // undefined must not be allowed to select one.
  test("rejects a token whose header carries no kid", async () => {
    await expect(validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt({ omitKid: true }) })).rejects.toThrow(
      "Invalid GCP IAM token"
    );
    expect(requestGet).not.toHaveBeenCalled();
  });

  test("rejects a token whose subject is not a service account email", async () => {
    await expect(
      validateIamIdentity({
        identityId: IDENTITY_ID,
        jwt: signIamJwt({ payload: { sub: "attacker@gmail.com", aud: IDENTITY_ID } })
      })
    ).rejects.toThrow("Invalid service account identifier");
    expect(requestGet).not.toHaveBeenCalled();
  });

  test("rejects a token with no subject", async () => {
    await expect(
      validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt({ payload: { aud: IDENTITY_ID } }) })
    ).rejects.toThrow("Invalid service account identifier");
    expect(requestGet).not.toHaveBeenCalled();
  });

  test("rejects a token whose kid matches none of the published keys", async () => {
    requestGet.mockResolvedValue({ data: { "some-other-kid": signingKeyPair.publicKey } });

    await expect(validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt() })).rejects.toThrow(
      "No matching signing key found for the GCP IAM token"
    );
  });

  test("rejects a token signed by a key other than the published one", async () => {
    await expect(
      validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt({ privateKey: otherKeyPair.privateKey }) })
    ).rejects.toThrow("Invalid GCP IAM token signature");
  });

  test("rejects an expired token", async () => {
    await expect(
      validateIamIdentity({ identityId: IDENTITY_ID, jwt: signIamJwt({ expiresIn: "-1h" }) })
    ).rejects.toThrow("Invalid GCP IAM token signature");
  });

  // An unsigned token must never verify, otherwise anyone able to name a service account
  // could mint an Infisical login.
  test("rejects an alg: none token", async () => {
    const [, payload] = signIamJwt().split(".");
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: KEY_ID })).toString("base64url");

    await expect(validateIamIdentity({ identityId: IDENTITY_ID, jwt: `${header}.${payload}.` })).rejects.toThrow(
      "Invalid GCP IAM token signature"
    );
  });

  test("rejects a token minted for a different identity", async () => {
    await expect(
      validateIamIdentity({
        identityId: IDENTITY_ID,
        jwt: signIamJwt({ payload: { sub: SERVICE_ACCOUNT, aud: "another-identity-id" } })
      })
    ).rejects.toThrow("Invalid audience in GCP IAM Token");
  });
});
