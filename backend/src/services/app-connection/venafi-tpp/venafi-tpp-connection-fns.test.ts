/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestWithVenafiTppGateway } from "./venafi-tpp-connection-fns";

// Asserts the "requestWithVenafiTppGateway" wrapper:
//   - direct (no gatewayId) -> safeRequest.request
//   - gateway v2           -> raw request via withGatewayV2Proxy
//   - no v2 gateway details available -> throws (v1 not supported)

const { safeRequestMock, httpRequestMock, withGatewayV2ProxyMock, verifyHostInputValidityMock } = vi.hoisted(() => ({
  safeRequestMock:
    vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
  httpRequestMock:
    vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
  withGatewayV2ProxyMock: vi.fn(async (...args: any[]) => {
    const cb = args[0] as (port: number) => Promise<unknown>;
    return cb(5678);
  }),
  verifyHostInputValidityMock: vi.fn(async ({ host }: { host: string }) => [host] as string[])
}));

vi.mock("@app/lib/validator/validate-url", () => ({
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

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: verifyHostInputValidityMock
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isDevelopmentMode: false }) }));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const BASE_REQ = {
  url: "https://venafi.example.com/vedsdk/certificates",
  method: "GET" as const,
  headers: { Authorization: "Bearer x" }
};

const okAxiosResponse = { data: { ok: true }, status: 200, headers: {} };

describe("requestWithVenafiTppGateway", () => {
  beforeEach(() => {
    safeRequestMock.mockReset();
    safeRequestMock.mockResolvedValue(okAxiosResponse);
    httpRequestMock.mockReset();
    httpRequestMock.mockResolvedValue(okAxiosResponse);
    withGatewayV2ProxyMock.mockClear();
    verifyHostInputValidityMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes through safeRequest when gatewayId is absent", async () => {
    await requestWithVenafiTppGateway(
      { gatewayId: null },
      { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any,
      BASE_REQ
    );

    expect(safeRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).not.toHaveBeenCalled();
    expect(safeRequestMock.mock.calls[0][0]).toMatchObject({ url: BASE_REQ.url });
  });

  it("routes through gateway v2 when v2 details resolve", async () => {
    const v2Details = { relayHost: "relay.example", gateway: { id: "g1" }, relay: { id: "r1" } };
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => v2Details);

    await requestWithVenafiTppGateway(
      { gatewayId: "gw-venafi" },
      { getPlatformConnectionDetailsByGatewayId } as any,
      BASE_REQ
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    const call = httpRequestMock.mock.calls[0][0];
    expect(String(call.url)).toContain("localhost:5678");
    expect(call.headers.Host).toBe("venafi.example.com");
    expect(call.httpsAgent).toBeDefined();
  });

  it("throws when a gateway is set but no v2 details are resolvable (v1 not supported)", async () => {
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => null);

    await expect(
      requestWithVenafiTppGateway(
        { gatewayId: "gw-venafi" },
        { getPlatformConnectionDetailsByGatewayId } as any,
        BASE_REQ
      )
    ).rejects.toThrow(/v2 gateways/i);

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).not.toHaveBeenCalled();
  });
});
