/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GatewayVersion } from "@app/lib/gateway/types";

import { requestWithHCVaultGateway } from "./hc-vault-connection-fns";

// Asserts the "requestWithHCVaultGateway" wrapper correctly routes:
//   - direct (no gatewayId)                 -> safeRequest.request
//   - gateway v2 (v2 connection details)    -> raw request via withGatewayV2Proxy
//   - gateway v1 (fallback when v2 absent)  -> raw request via withGatewayProxy

const { safeRequestMock, httpRequestMock, withGatewayProxyMock, withGatewayV2ProxyMock, verifyHostInputValidityMock } =
  vi.hoisted(() => ({
    safeRequestMock:
      vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
    httpRequestMock:
      vi.fn<(...args: any[]) => Promise<{ data: unknown; status: number; headers: Record<string, unknown> }>>(),
    withGatewayProxyMock: vi.fn(async (...args: any[]) => {
      const cb = args[0] as (port: number, httpsAgent?: unknown) => Promise<unknown>;
      return cb(1234);
    }),
    withGatewayV2ProxyMock: vi.fn(async (...args: any[]) => {
      const cb = args[0] as (port: number) => Promise<unknown>;
      return cb(5678);
    }),
    verifyHostInputValidityMock: vi.fn(async ({ host }: { host: string }) => [host] as string[])
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
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" },
  withGatewayProxy: (cb: (port: number) => Promise<unknown>, options: unknown) => withGatewayProxyMock(cb, options)
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
  url: "https://vault.example.com:8200/v1/auth/token/lookup-self",
  method: "GET" as const,
  headers: { "X-Vault-Token": "t" }
};

const okAxiosResponse = { data: { ok: true }, status: 200, headers: {} };

describe("requestWithHCVaultGateway", () => {
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

  it("routes through safeRequest when gatewayId is absent", async () => {
    await requestWithHCVaultGateway(
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

  it("routes through gateway v2 (raw request) when v2 details resolve", async () => {
    const v2Details = { relayHost: "relay.example", gateway: { id: "g1" }, relay: { id: "r1" } };
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => v2Details);

    await requestWithHCVaultGateway(
      { gatewayId: "gw-vault" },
      { fnGetGatewayClientTlsByGatewayId: vi.fn() } as any,
      { getPlatformConnectionDetailsByGatewayId } as any,
      BASE_REQ
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).toHaveBeenCalledTimes(1);
    expect(withGatewayProxyMock).not.toHaveBeenCalled();
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    const call = httpRequestMock.mock.calls[0][0];
    expect(String(call.url)).toContain("localhost:5678");
    expect(call.headers.Host).toBe("vault.example.com");
  });

  it("falls back to gateway v1 (raw request) when v2 details are null", async () => {
    const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => null);
    const fnGetGatewayClientTlsByGatewayId = vi.fn(async () => ({
      relayPort: 9999,
      relayHost: "relay.v1",
      tlsOptions: {},
      identityId: "i",
      orgId: "o"
    }));

    await requestWithHCVaultGateway(
      { gatewayId: "gw-vault" },
      { fnGetGatewayClientTlsByGatewayId } as any,
      { getPlatformConnectionDetailsByGatewayId } as any,
      BASE_REQ
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
    expect(withGatewayV2ProxyMock).not.toHaveBeenCalled();
    expect(withGatewayProxyMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
    expect(fnGetGatewayClientTlsByGatewayId).toHaveBeenCalledWith("gw-vault");
  });

  it("uses pre-supplied V1 gateway details without calling the DAL again", async () => {
    const fnGetGatewayClientTlsByGatewayId = vi.fn();

    await requestWithHCVaultGateway(
      { gatewayId: "gw-vault" },
      { fnGetGatewayClientTlsByGatewayId } as any,
      { getPlatformConnectionDetailsByGatewayId: vi.fn() } as any,
      BASE_REQ,
      {
        gatewayVersion: GatewayVersion.V1,
        details: { relayPort: 1, relayHost: "h", tlsOptions: {}, identityId: "i", orgId: "o" } as any,
        target: { host: "vault.example.com", port: 8200 }
      }
    );

    expect(fnGetGatewayClientTlsByGatewayId).not.toHaveBeenCalled();
    expect(withGatewayProxyMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
  });
});
