/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KubernetesProvider } from "./kubernetes";
import { KubernetesAuthMethod, KubernetesCredentialType } from "./models";

// Asserts the k8sHttpClient factory inside KubernetesProvider:
//   - direct path (isGatewayProxied=false, caller-asserted):
//       * uses safeRequest (never request)
//       * translates ca / sslRejectUnauthorized into safeRequest's flat options
//       * drops the caller's pre-built httpsAgent
//       * always sets allowPrivateIps: true (in-cluster RFC1918 / link-local)
//   - gateway path (isGatewayProxied=true via $gatewayProxyWrapper):
//       * uses raw request (never safeRequest)
//       * preserves the gateway-supplied httpsAgent
//
// We drive this through the exported KubernetesProvider.validateConnection
// using the Static credential type (single GET) to keep the test minimal.

const { safeGetMock, safePostMock, safeDeleteMock, rawGetMock, rawPostMock, rawDeleteMock } = vi.hoisted(() => ({
  safeGetMock: vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number }>>(),
  safePostMock: vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number }>>(),
  safeDeleteMock: vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number }>>(),
  rawGetMock: vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number }>>(),
  rawPostMock: vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number }>>(),
  rawDeleteMock: vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number }>>()
}));

vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: vi.fn(async () => undefined),
  safeRequest: {
    get: (...args: unknown[]) => safeGetMock(...args),
    post: (...args: unknown[]) => safePostMock(...args),
    delete: (...args: unknown[]) => safeDeleteMock(...args)
  }
}));

vi.mock("@app/lib/config/request", () => ({
  request: {
    get: (...args: unknown[]) => rawGetMock(...args),
    post: (...args: unknown[]) => rawPostMock(...args),
    delete: (...args: unknown[]) => rawDeleteMock(...args)
  },
  createRequestClient: () => ({
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }),
  axiosResponseInterceptor: (r: unknown) => r
}));

vi.mock("@app/lib/gateway", () => ({
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" },
  GatewayHttpProxyActions: { UseGatewayK8sServiceAccount: "use-gateway-k8s-sa" },
  withGatewayProxy: async (cb: (port: number, agent: unknown) => Promise<unknown>, opts: any) =>
    cb(1234, opts?.httpsAgent)
}));

vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: async (cb: (port: number) => Promise<unknown>) => cb(5678)
}));

vi.mock("./templateUtils", () => ({
  generateUsername: vi.fn(async () => "dynamic-secret-sa-abc123")
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isDevelopmentMode: false }) }));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const STATIC_INPUT_BASE = {
  credentialType: KubernetesCredentialType.Static,
  serviceAccountName: "my-sa",
  namespace: "default",
  audiences: [],
  authMethod: KubernetesAuthMethod.Api,
  clusterToken: "tok-abc",
  url: "https://k8s.example.com:6443",
  sslEnabled: true,
  ca: "-----BEGIN CERTIFICATE-----\nFAKECACERT==\n-----END CERTIFICATE-----",
  sslRejectUnauthorized: true
};

/** `TDynamicProviderFns.validateConnection` always receives project metadata; K8s ignores it in this test. */
const VALIDATE_METADATA = { projectId: "00000000-0000-0000-0000-000000000000" };

describe("KubernetesProvider — k8sHttpClient dispatch", () => {
  beforeEach(() => {
    for (const m of [safeGetMock, safePostMock, safeDeleteMock, rawGetMock, rawPostMock, rawDeleteMock]) {
      m.mockReset();
      m.mockResolvedValue({ data: {}, status: 200 });
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("direct call (no gatewayId) → safeRequest.get with ca/rejectUnauthorized flat + allowPrivateIps + no httpsAgent", async () => {
    const provider = KubernetesProvider({
      gatewayService: { fnGetGatewayClientTlsByGatewayId: vi.fn() } as any,
      gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any
    });

    await provider.validateConnection({ ...STATIC_INPUT_BASE }, VALIDATE_METADATA);

    expect(safeGetMock).toHaveBeenCalledTimes(1);
    expect(rawGetMock).not.toHaveBeenCalled();

    const [, opts] = safeGetMock.mock.calls[0];
    expect(opts.allowPrivateIps).toBe(true);
    expect(opts.ca).toBe(STATIC_INPUT_BASE.ca);
    expect(opts.rejectUnauthorized).toBe(true);
    // Direct mode must drop the caller's pre-built httpsAgent — safeRequest
    // builds its own pinned agent from the flat options above.
    expect(opts.httpsAgent).toBeUndefined();
  });

  it("gateway path ($gatewayProxyWrapper asserts isGatewayProxied=true) → raw request.get with httpsAgent preserved", async () => {
    const gatewayDetails = { relayHost: "relay", gateway: { id: "g" }, relay: { id: "r" } };
    const provider = KubernetesProvider({
      gatewayService: { fnGetGatewayClientTlsByGatewayId: vi.fn() } as any,
      gatewayV2Service: {
        getPlatformConnectionDetailsByGatewayId: vi.fn(async () => gatewayDetails)
      } as any
    });

    await provider.validateConnection(
      {
        ...STATIC_INPUT_BASE,
        gatewayId: "gw-k8s"
      },
      VALIDATE_METADATA
    );

    expect(rawGetMock).toHaveBeenCalledTimes(1);
    expect(safeGetMock).not.toHaveBeenCalled();

    const [, opts] = rawGetMock.mock.calls[0];
    // Gateway path preserves the caller's https.Agent (carrying the relay TLS
    // context). The gateway already constrains the originally configured target.
    expect(opts.httpsAgent).toBeDefined();
    // It must NOT leak safeRequest-only flat TLS opts into the raw-request call.
    expect(opts.allowPrivateIps).toBeUndefined();
    expect(opts.ca).toBeUndefined();
    expect(opts.rejectUnauthorized).toBeUndefined();
  });

  it("direct call with sslEnabled=false does NOT forward ca / rejectUnauthorized (only allowPrivateIps stays)", async () => {
    const provider = KubernetesProvider({
      gatewayService: { fnGetGatewayClientTlsByGatewayId: vi.fn() } as any,
      gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any
    });

    await provider.validateConnection(
      {
        ...STATIC_INPUT_BASE,
        sslEnabled: false,
        ca: undefined
      },
      VALIDATE_METADATA
    );

    expect(safeGetMock).toHaveBeenCalledTimes(1);
    const [, opts] = safeGetMock.mock.calls[0];
    expect(opts.allowPrivateIps).toBe(true);
    expect(opts.ca).toBeUndefined();
    expect(opts.rejectUnauthorized).toBeUndefined();
  });
});
