import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import * as pkijs from "pkijs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { buildHsmCaSigner } from "@app/services/certificate-authority/ca-signer";

import { OCSP_NONCE_OID } from "./certificate-authority-ocsp-enums";

const getCaSignerMock = vi.fn();

vi.mock("@app/services/certificate-authority/certificate-authority-fns", () => ({
  getCaSigner: (...args: unknown[]) => getCaSignerMock(...args) as unknown
}));

vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-key-id")
}));

// eslint-disable-next-line import/first
import { certificateAuthorityOcspServiceFactory } from "./certificate-authority-ocsp-service";

const buildKeyStore = () => {
  const store = new Map<string, string>();
  return {
    getItemPrimary: vi.fn(async (key: string) => store.get(key) ?? null),
    setItemWithExpiry: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return "OK" as const;
    }),
    incrementSeededWithExpiry: vi.fn(async (key: string, seed: number) => {
      const next = store.has(key) ? Number(store.get(key)) + 1 : seed + 1;
      store.set(key, String(next));
      return next;
    }),
    store
  };
};

type THarness = Awaited<ReturnType<typeof buildHarness>>;

let caCounter = 0;

const buildHarness = async () => {
  caCounter += 1;
  const caId = `ca-${caCounter}`;
  const caCertId = `ca-cert-${caCounter}`;

  const keys = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;

  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: `CN=Coalescing Root ${caCounter}`,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    keys,
    extensions: [new x509.BasicConstraintsExtension(true, 2, true)]
  });

  let signCount = 0;
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  const signer = buildHsmCaSigner({
    caPublicKey: keys.publicKey,
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
    sign: async (tbs) => {
      signCount += 1;
      await gate;
      return Buffer.from(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, tbs));
    }
  });

  getCaSignerMock.mockResolvedValue({ signer });

  const keyStore = buildKeyStore();

  let ocspGeneration = 0;

  const service = certificateAuthorityOcspServiceFactory({
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn(async () => ({
        id: caId,
        projectId: "project-1",
        internalCa: { id: "internal-1", isOcspEnabled: true, activeCaCertId: caCertId, ocspGeneration }
      }))
    } as never,
    certificateAuthorityCertDAL: {
      findById: vi.fn(async () => ({ id: caCertId, encryptedCertificate: Buffer.from("ignored") }))
    } as never,
    certificateAuthoritySecretDAL: { findOne: vi.fn() } as never,
    certificateDAL: { find: vi.fn(async () => []), primaryNode: vi.fn(() => undefined) } as never,
    projectDAL: { findById: vi.fn(), findOne: vi.fn(), updateById: vi.fn(), transaction: vi.fn() } as never,
    kmsService: {
      decryptWithKmsKey: vi.fn(async () => async () => Buffer.from(caCert.rawData)),
      generateKmsKey: vi.fn()
    } as never,
    hsmConnectorService: { sign: vi.fn() } as never,
    keyStore: keyStore as never
  });

  const buildRequestDer = async (nonce?: Buffer) => {
    const request = new pkijs.OCSPRequest();
    await request.createForCertificate(pkijs.Certificate.fromBER(caCert.rawData), {
      hashAlgorithm: "SHA-256",
      issuerCertificate: pkijs.Certificate.fromBER(caCert.rawData)
    });

    if (nonce) {
      request.tbsRequest.requestExtensions = [
        new pkijs.Extension({
          extnID: OCSP_NONCE_OID,
          critical: false,
          extnValue: new (await import("asn1js")).OctetString({ valueHex: nonce }).toBER(false)
        })
      ];
    }

    return Buffer.from(request.toSchema(true).toBER(false));
  };

  return {
    caId,
    service,
    buildRequestDer,
    keyStore,
    cacheKeys: () => [...keyStore.store.keys()].filter((k) => k.startsWith("ocsp-response:")),
    storeHas: (cacheKeys: string[]) => cacheKeys.length > 0 && cacheKeys.every((k) => keyStore.store.has(k)),
    getSignCount: () => signCount,
    releaseGate: () => releaseGate(),
    revoke: () => {
      ocspGeneration += 1;
    }
  };
};

beforeAll(() => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  pkijs.setEngine("coalescing-test", new pkijs.CryptoEngine({ crypto: webcrypto as unknown as Crypto }));
});

beforeEach(() => {
  getCaSignerMock.mockReset();
});

describe("OCSP single-flight coalescing", () => {
  it("should sign once for concurrent identical nonce-free requests and hand every caller the same bytes", async () => {
    const harness: THarness = await buildHarness();
    const requestDer = await harness.buildRequestDer();

    const inFlight = Array.from({ length: 6 }, () =>
      harness.service.getOcspResponse({ caId: harness.caId, requestDer })
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    harness.releaseGate();

    const results = await Promise.all(inFlight);

    expect(harness.getSignCount()).toBe(1);
    const [first] = results;
    for (const result of results) {
      expect(result.response.equals(first.response)).toBe(true);
      expect(result.maxAgeSeconds).toBeGreaterThan(0);
    }
  });

  it("should sign per request when a nonce is present so no caller receives another caller's nonce", async () => {
    const harness: THarness = await buildHarness();
    const requestDers = await Promise.all([
      harness.buildRequestDer(Buffer.alloc(16, 1)),
      harness.buildRequestDer(Buffer.alloc(16, 2)),
      harness.buildRequestDer(Buffer.alloc(16, 3))
    ]);

    const inFlight = requestDers.map((requestDer) =>
      harness.service.getOcspResponse({ caId: harness.caId, requestDer })
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    harness.releaseGate();

    const results = await Promise.all(inFlight);

    expect(harness.getSignCount()).toBe(3);
    expect(results[0].response.equals(results[1].response)).toBe(false);
    for (const result of results) {
      expect(result.maxAgeSeconds).toBe(0);
    }
  });
});

describe("revocation during an in-flight signing", () => {
  it("should not hand a request that arrived after the revocation the pre-revocation response", async () => {
    const harness: THarness = await buildHarness();
    const requestDer = await harness.buildRequestDer();

    const leader = harness.service.getOcspResponse({ caId: harness.caId, requestDer });

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    harness.revoke();

    const follower = harness.service.getOcspResponse({ caId: harness.caId, requestDer });

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    harness.releaseGate();

    const [leaderResult, followerResult] = await Promise.all([leader, follower]);

    expect(harness.getSignCount()).toBe(2);
    expect(followerResult.response.equals(leaderResult.response)).toBe(false);
  });
});

describe("cache coherence after revocation", () => {
  it("should not serve a cached good once the generation moves, even with nothing deleting the key", async () => {
    const harness: THarness = await buildHarness();
    const requestDer = await harness.buildRequestDer();

    harness.releaseGate();
    const first = await harness.service.getOcspResponse({ caId: harness.caId, requestDer });
    expect(harness.getSignCount()).toBe(1);

    const second = await harness.service.getOcspResponse({ caId: harness.caId, requestDer });
    expect(harness.getSignCount()).toBe(1);
    expect(second.response.equals(first.response)).toBe(true);

    // the cached entry is deliberately left in the store: only the generation moved
    harness.revoke();
    expect(harness.storeHas(harness.cacheKeys())).toBe(true);

    const third = await harness.service.getOcspResponse({ caId: harness.caId, requestDer });
    expect(harness.getSignCount()).toBe(2);
    expect(third.response.equals(first.response)).toBe(false);
  });
});
