/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeNetScalerOperationWithGateway } from "./netscaler-connection-fns";

// Asserts the "executeNetScalerOperationWithGateway" helper:
//   - direct path (no gatewayId) uses safeRequest with rejectUnauthorized/ca
//     forwarded as flat options (never a pre-built https.Agent)
//   - gateway v2 path uses raw request via withGatewayV2Proxy and passes
//     ca/rejectUnauthorized through a locally-built httpsAgent
//   - gateway path without resolvable v2 connection details throws

const { safeRequestMock, httpRequestMock, withGatewayV2ProxyMock } = vi.hoisted(() => ({
  safeRequestMock:
    vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
  httpRequestMock:
    vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
  withGatewayV2ProxyMock: vi.fn(async (...args: any[]) => {
    const cb = args[0] as (port: number) => Promise<unknown>;
    return cb(5678);
  })
}));

vi.mock("@app/lib/validator", () => ({
  safeRequest: { request: (...args: unknown[]) => safeRequestMock(...args) }
}));

vi.mock("@app/lib/config/request", () => ({
  request: { request: (...args: unknown[]) => httpRequestMock(...args) },
  createRequestClient: () => ({
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    request: (...args: unknown[]) => httpRequestMock(...args),
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }),
  axiosResponseInterceptor: (r: unknown) => r
}));

vi.mock("@app/lib/gateway", () => ({
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" }
}));

vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: (cb: (port: number) => Promise<unknown>, options: unknown) => withGatewayV2ProxyMock(cb, options)
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isDevelopmentMode: false }) }));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const CREDS = {
  hostname: "netscaler.example.com",
  port: 443,
  username: "u",
  password: "p",
  sslRejectUnauthorized: true,
  sslCertificate: "-----BEGIN CERTIFICATE-----\nMIIBASEFAKE==\n-----END CERTIFICATE-----"
};

const okDataResponse = { data: { ok: true }, status: 200, headers: {} };

describe("executeNetScalerOperationWithGateway", () => {
  beforeEach(() => {
    safeRequestMock.mockReset();
    safeRequestMock.mockResolvedValue(okDataResponse);
    httpRequestMock.mockReset();
    httpRequestMock.mockResolvedValue(okDataResponse);
    withGatewayV2ProxyMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("direct path routes through safeRequest with rejectUnauthorized/ca as flat options", async () => {
    const result = await executeNetScalerOperationWithGateway(
      { gatewayId: null, credentials: CREDS },
      undefined,
      async (makeRequest) =>
        makeRequest<{ ok: boolean }>({
          url: `https://${CREDS.hostname}:${CREDS.port}/nitro/v1/config/login`,
          method: "POST",
          data: { login: {} }
        })
    );

    expect(result).toEqual({ ok: true });
    expect(safeRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).not.toHaveBeenCalled();

    const opts = safeRequestMock.mock.calls[0][0];
    expect(opts.rejectUnauthorized).toBe(true);
    expect(opts.ca).toEqual([CREDS.sslCertificate]);
    expect(opts.httpsAgent).toBeUndefined();
  });

  it("gateway v2 path routes through raw request with httpsAgent carrying ca/rejectUnauthorized", async () => {
    const v2Details = { relayHost: "relay.example", gateway: { id: "g1" }, relay: { id: "r1" } };
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => v2Details);

    await executeNetScalerOperationWithGateway(
      { gatewayId: "gw-nsc", credentials: CREDS },
      { getPlatformConnectionDetailsByGatewayId } as any,
      async (makeRequest) =>
        makeRequest<{ ok: boolean }>({
          url: `https://${CREDS.hostname}:${CREDS.port}/nitro/v1/config/login`,
          method: "POST",
          data: { login: {} }
        })
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);

    const call = httpRequestMock.mock.calls[0][0];
    expect(String(call.url)).toContain("localhost:5678");
    expect(call.headers.Host).toBe(CREDS.hostname);
    expect(call.httpsAgent).toBeDefined();
    expect(call.rejectUnauthorized).toBeUndefined();
    expect(call.ca).toBeUndefined();
  });

  it("throws when a gateway is set but v2 details are not resolvable", async () => {
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => null);

    await expect(
      executeNetScalerOperationWithGateway(
        { gatewayId: "gw-nsc", credentials: CREDS },
        { getPlatformConnectionDetailsByGatewayId } as any,
        async (makeRequest) => makeRequest<{ ok: boolean }>({ url: "https://x", method: "GET" })
      )
    ).rejects.toThrow(/no platform connection details/i);

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
  });
});
