/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestWithGitHubGateway } from "./github-connection-fns";

// Asserts the "requestWithGitHubGateway" wrapper correctly routes:
//   - direct (no gatewayId)       -> safeRequest.request
//   - gateway v1 (fnGetGatewayClientTlsByGatewayId only)
//   - gateway v2 (getPlatformConnectionDetailsByGatewayId returns details)
// and never leaks a gateway call onto safeRequest or vice-versa.

const { safeRequestMock, httpRequestMock, withGatewayProxyMock, withGatewayV2ProxyMock, verifyHostInputValidityMock } =
  vi.hoisted(() => ({
    safeRequestMock:
      vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
    httpRequestMock:
      vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
    // withGatewayProxy(cb, options) -> invoke cb(1234); track only cb on the spy (see vi.mock wrappers)
    withGatewayProxyMock: vi.fn(async (cb: (port: number, httpsAgent?: unknown) => Promise<unknown>) => cb(1234)),
    withGatewayV2ProxyMock: vi.fn(async (cb: (port: number) => Promise<unknown>) => cb(5678)),
    verifyHostInputValidityMock: vi.fn(async ({ host }: { host: string }) => [host] as string[])
  }));

vi.mock("@app/lib/validator", () => ({
  safeRequest: { request: (...args: unknown[]) => safeRequestMock(...args) },
  blockLocalAndPrivateIpAddresses: vi.fn(async () => undefined)
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
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" },
  withGatewayProxy: (cb: (port: number, httpsAgent?: unknown) => Promise<unknown>, options: unknown) => {
    void options;
    return withGatewayProxyMock(cb);
  }
}));

vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: (cb: (port: number) => Promise<unknown>, options: unknown) => {
    void options;
    return withGatewayV2ProxyMock(cb);
  }
}));

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: verifyHostInputValidityMock
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isDevelopmentMode: false }) }));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const BASE_REQ = {
  url: "https://api.github.com/app",
  method: "GET" as const,
  headers: { Accept: "application/vnd.github+json" }
};

const okAxiosResponse = { data: { ok: true }, status: 200, headers: {} };

describe("requestWithGitHubGateway", () => {
  beforeEach(() => {
    safeRequestMock.mockReset();
    safeRequestMock.mockResolvedValue(okAxiosResponse);
    httpRequestMock.mockReset();
    httpRequestMock.mockResolvedValue(okAxiosResponse);
    withGatewayProxyMock.mockClear();
    withGatewayV2ProxyMock.mockClear();
    verifyHostInputValidityMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes through safeRequest when gatewayId is null (direct path)", async () => {
    await requestWithGitHubGateway(
      { gatewayId: null },
      { fnGetGatewayClientTlsByGatewayId: vi.fn() } as any,
      { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any,
      BASE_REQ
    );

    expect(safeRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(withGatewayProxyMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).not.toHaveBeenCalled();
    expect(safeRequestMock.mock.calls[0][0]).toMatchObject({ url: BASE_REQ.url, method: "GET" });
  });

  it("routes through gateway v2 (raw request) when v2 connection details are supplied", async () => {
    const v2Details = { relayHost: "relay.example", gateway: { id: "g1" }, relay: { id: "r1" } };

    await requestWithGitHubGateway(
      { gatewayId: "gw-123" },
      { fnGetGatewayClientTlsByGatewayId: vi.fn() } as any,
      { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any,
      BASE_REQ,
      v2Details as any
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).toHaveBeenCalledTimes(1);
    expect(withGatewayProxyMock).not.toHaveBeenCalled();
    expect(httpRequestMock).toHaveBeenCalledTimes(1);

    const call = httpRequestMock.mock.calls[0][0];
    expect(String(call.url)).toContain("localhost:5678");
    expect(call.headers.Host).toBe("api.github.com");
    expect(call.httpsAgent).toBeDefined();
  });

  it("falls back to gateway v1 (raw request) when no v2 details are supplied", async () => {
    const fnGetGatewayClientTlsByGatewayId = vi.fn(async () => ({
      relayPort: 9999,
      relayHost: "relay.v1",
      tlsOptions: {},
      identityId: "i",
      orgId: "o"
    }));

    await requestWithGitHubGateway(
      { gatewayId: "gw-123" },
      { fnGetGatewayClientTlsByGatewayId } as any,
      { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any,
      BASE_REQ
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).not.toHaveBeenCalled();
    expect(withGatewayProxyMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(fnGetGatewayClientTlsByGatewayId).toHaveBeenCalledWith("gw-123");

    const call = httpRequestMock.mock.calls[0][0];
    expect(String(call.url)).toContain("localhost:1234");
    expect(call.headers.Host).toBe("api.github.com");
  });
});
