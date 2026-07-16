/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { blockMock, requestMock, safeRequestMock } = vi.hoisted(() => ({
  blockMock: vi.fn(),
  requestMock: vi.fn(),
  safeRequestMock: vi.fn()
}));

// safeRequest validates the host, pins the connection to the validated IPs, and disables redirects;
// its behaviour is covered by safe-request.test.ts. Here we only assert that the non-gateway path
// delegates to it (rather than issuing a raw, un-pinned request).
vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: (...args: unknown[]) => (blockMock as any)(...args),
  safeRequest: { request: (...args: unknown[]) => (safeRequestMock as any)(...args) }
}));
vi.mock("@app/lib/config/request", () => ({
  request: { request: (...args: unknown[]) => (requestMock as any)(...args) }
}));
// Stub out the heavier transitive imports so the module loads in isolation.
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/lib/crypto", () => ({ crypto: {} }));
vi.mock("@app/lib/gateway", () => ({
  withGatewayProxy: vi.fn(),
  GatewayProxyProtocol: { Tcp: "tcp", Http: "http" }
}));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({ withGatewayV2Proxy: vi.fn() }));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => ["host"])
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({ getAppConnectionMethodName: vi.fn() }));

// eslint-disable-next-line import/first
import { requestWithGitHubGateway } from "./github-connection-fns";

describe("requestWithGitHubGateway — non-gateway request handling", () => {
  beforeEach(() => {
    blockMock.mockReset();
    requestMock.mockReset();
    safeRequestMock.mockReset();
    safeRequestMock.mockResolvedValue({ data: {}, status: 200, headers: {} });
  });

  it("routes the non-gateway request through safeRequest (host-validated + IP-pinned + no redirects)", async () => {
    await requestWithGitHubGateway({ gatewayId: null }, {} as any, {} as any, {
      url: "https://api.github.com/user/repos",
      method: "GET"
    });

    expect(safeRequestMock).toHaveBeenCalledTimes(1);
    expect(safeRequestMock).toHaveBeenCalledWith(expect.objectContaining({ url: "https://api.github.com/user/repos" }));
    // The raw, non-pinning client must not be used on the direct path.
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no URL instead of throwing a raw TypeError", async () => {
    await expect(
      requestWithGitHubGateway({ gatewayId: null }, {} as any, {} as any, { method: "GET" })
    ).rejects.toThrow(/missing a target URL/);

    expect(safeRequestMock).not.toHaveBeenCalled();
  });
});
