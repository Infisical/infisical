/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { identityKubernetesAuthServiceFactory } from "./identity-kubernetes-auth-service";
import { IdentityKubernetesAuthTokenReviewMode } from "./identity-kubernetes-auth-types";

// Asserts the interaction of $resolveEffectiveVerifyTlsCertificate with
// safeRequest.post in the "raw" token-review path:
//   - the resolved boolean flows into the flat `rejectUnauthorized` option
//   - ca is passed as a flat string, not wrapped in a pre-built https.Agent
//   - caCert === "" always forces rejectUnauthorized=false, regardless of
//     the stored verifyTlsCertificate flag
//
// We drive the factory's login() far enough to hit safeRequest.post and
// then have the mock throw so we can inspect the captured call options.

const { safePostMock, rawPostMock } = vi.hoisted(() => ({
  safePostMock: vi.fn(),
  rawPostMock: vi.fn()
}));

vi.mock("@app/lib/validator", () => ({
  safeRequest: { post: (...args: unknown[]) => safePostMock(...args) }
}));

vi.mock("@app/lib/config/request", () => ({
  request: { post: (...args: unknown[]) => rawPostMock(...args) },
  createRequestClient: () => ({
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }),
  axiosResponseInterceptor: (r: unknown) => r
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ OTEL_TELEMETRY_COLLECTION_ENABLED: false, isDevelopmentMode: false })
}));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock("@app/lib/request-context/request-memoizer", () => ({
  requestMemoize: async <T>(_k: string, fetcher: () => Promise<T>) => fetcher()
}));

// Mock the gateway modules to avoid loading @infisical/quic native bindings.
vi.mock("@app/lib/gateway", () => ({
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" },
  GatewayHttpProxyActions: { UseGatewayK8sServiceAccount: "use-gateway-k8s-sa" },
  withGatewayProxy: vi.fn()
}));
vi.mock("@app/lib/gateway/types", () => ({
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" },
  GatewayHttpProxyActions: { UseGatewayK8sServiceAccount: "use-gateway-k8s-sa" },
  GatewayVersion: { V1: "v1", V2: "v2" }
}));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: vi.fn()
}));

vi.mock("@app/lib/request-context/memo-keys", () => ({
  requestMemoKeys: { identityFindById: (id: string) => `id:${id}`, orgFindById: (id: string) => `org:${id}` }
}));

vi.mock("@app/lib/request-context/request-context-keys", () => ({
  RequestContextKey: { Ip: "ip", UserAgent: "ua", Memoizer: "mem" }
}));

// Required to avoid loading the real fastify request context wrapper
vi.mock("@fastify/request-context", () => ({ requestContext: { get: () => undefined } }));

vi.mock("@app/lib/telemetry/metrics", () => ({
  authAttemptCounter: { add: vi.fn() },
  AuthAttemptAuthMethod: { KUBERNETES_AUTH: "kubernetes-auth" },
  AuthAttemptAuthResult: { FAILURE: "failure", SUCCESS: "success" }
}));

type KubernetesAuthRecord = Record<string, unknown>;

const buildService = (kubernetesAuthRecord: KubernetesAuthRecord, caCertPlainText: string) => {
  const decryptor = vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer | null }) =>
    Buffer.from(cipherTextBlob ? caCertPlainText : "")
  );

  return identityKubernetesAuthServiceFactory({
    identityDAL: { findById: vi.fn(async () => ({ id: "i-1", orgId: "o-1", name: "test-identity" })) } as any,
    identityKubernetesAuthDAL: {
      findOne: vi.fn(async () => kubernetesAuthRecord),
      create: vi.fn(),
      transaction: vi.fn(),
      updateById: vi.fn(),
      delete: vi.fn()
    } as any,
    identityAccessTokenDAL: { create: vi.fn(), delete: vi.fn() } as any,
    membershipIdentityDAL: { findOne: vi.fn(), update: vi.fn(), getIdentityById: vi.fn() } as any,
    permissionService: { getOrgPermission: vi.fn(), getProjectPermission: vi.fn() } as any,
    licenseService: { getPlan: vi.fn() } as any,
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({ decryptor, encryptor: vi.fn() }))
    } as any,
    gatewayService: {} as any,
    gatewayV2Service: {} as any,
    gatewayDAL: { find: vi.fn() } as any,
    gatewayV2DAL: { find: vi.fn() } as any,
    gatewayPoolService: { getPlatformConnectionDetailsByPoolId: vi.fn(), pickRandomHealthyGateway: vi.fn() } as any,
    gatewayPoolDAL: { findById: vi.fn() } as any,
    orgDAL: {
      findById: vi.fn(async () => ({ id: "o-1", name: "test-org", rootOrgId: null })),
      findOne: vi.fn(),
      findEffectiveOrgMembership: vi.fn()
    } as any,
    identityAccessTokenService: { issueIdentityAccessToken: vi.fn(), revokeAllTokensForIdentity: vi.fn() } as any
  });
};

const BASE_AUTH_RECORD = {
  identityId: "i-1",
  kubernetesHost: "https://k8s.example.com:6443",
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
  gatewayId: null,
  gatewayV2Id: null,
  gatewayPoolId: null,
  allowedAudience: null,
  allowedNamespaces: null,
  allowedNames: null,
  encryptedKubernetesTokenReviewerJwt: Buffer.from("ciphertext"),
  encryptedKubernetesCaCertificate: Buffer.from("ciphertext")
};

describe("identityKubernetesAuthService — $resolveEffectiveVerifyTlsCertificate → safeRequest", () => {
  beforeEach(() => {
    safePostMock.mockReset();
    // Throw so login() exits before the token-review result is parsed — we
    // only care about the args safeRequest.post received.
    safePostMock.mockRejectedValue(new Error("short-circuit for test"));
    rawPostMock.mockReset();
    rawPostMock.mockRejectedValue(new Error("should not be called"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes rejectUnauthorized=true + ca as flat options when caCert present and verify=true", async () => {
    const svc = buildService(
      { ...BASE_AUTH_RECORD, verifyTlsCertificate: true },
      "-----BEGIN CERTIFICATE-----\nREALCACERT==\n-----END CERTIFICATE-----"
    );

    await expect(svc.login({ identityId: "i-1", jwt: "service-account-jwt" })).rejects.toThrow();

    expect(safePostMock).toHaveBeenCalledTimes(1);
    expect(rawPostMock).not.toHaveBeenCalled();

    const [, , opts] = safePostMock.mock.calls[0];
    expect(opts.rejectUnauthorized).toBe(true);
    expect(opts.ca).toBe("-----BEGIN CERTIFICATE-----\nREALCACERT==\n-----END CERTIFICATE-----");
    expect(opts.allowPrivateIps).toBe(true);
    expect(opts.httpsAgent).toBeUndefined();
  });

  it("collapses rejectUnauthorized to false when caCert is empty (even if stored verify=true)", async () => {
    const svc = buildService({ ...BASE_AUTH_RECORD, verifyTlsCertificate: true }, "");

    await expect(svc.login({ identityId: "i-1", jwt: "service-account-jwt" })).rejects.toThrow();

    expect(safePostMock).toHaveBeenCalledTimes(1);
    const [, , opts] = safePostMock.mock.calls[0];
    expect(opts.rejectUnauthorized).toBe(false);
    expect(opts.ca).toBeUndefined();
    expect(opts.httpsAgent).toBeUndefined();
  });

  it("passes rejectUnauthorized=false when caCert present but stored verify=false", async () => {
    const svc = buildService(
      { ...BASE_AUTH_RECORD, verifyTlsCertificate: false },
      "-----BEGIN CERTIFICATE-----\nREALCACERT==\n-----END CERTIFICATE-----"
    );

    await expect(svc.login({ identityId: "i-1", jwt: "service-account-jwt" })).rejects.toThrow();

    expect(safePostMock).toHaveBeenCalledTimes(1);
    const [, , opts] = safePostMock.mock.calls[0];
    expect(opts.rejectUnauthorized).toBe(false);
    expect(opts.ca).toBe("-----BEGIN CERTIFICATE-----\nREALCACERT==\n-----END CERTIFICATE-----");
    expect(opts.httpsAgent).toBeUndefined();
  });
});
