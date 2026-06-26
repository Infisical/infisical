/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { blockMock, requestMock } = vi.hoisted(() => ({
  blockMock: vi.fn(),
  requestMock: vi.fn()
}));

// Keep the real host guard out of this test (it is covered by safe-request.test.ts); here we only
// assert that requestWithGitHubGateway invokes it before issuing a request on the non-gateway path.
vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: (...args: unknown[]) => (blockMock as any)(...args)
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

describe("requestWithGitHubGateway — non-gateway SSRF guard", () => {
  beforeEach(() => {
    blockMock.mockReset();
    requestMock.mockReset();
    requestMock.mockResolvedValue({ data: {}, status: 200, headers: {} });
  });

  it("runs the host guard before issuing a request on the non-gateway path", async () => {
    blockMock.mockResolvedValue(undefined);

    await requestWithGitHubGateway({ gatewayId: null }, {} as any, {} as any, {
      url: "https://api.github.com/user/repos",
      method: "GET"
    });

    // The guard must run, with the request URL, before the outbound request is issued.
    expect(blockMock).toHaveBeenCalledWith("https://api.github.com/user/repos");
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(blockMock.mock.invocationCallOrder[0]).toBeLessThan(requestMock.mock.invocationCallOrder[0]);
  });

  it("does not issue the request when the host guard rejects (non-gateway path)", async () => {
    blockMock.mockRejectedValue(new BadRequestError({ message: "Local IPs not allowed as URL" }));

    await expect(
      requestWithGitHubGateway({ gatewayId: null }, {} as any, {} as any, {
        url: "http://127.0.0.1/user/repos",
        method: "GET"
      })
    ).rejects.toThrow(/Local IPs not allowed/);

    expect(requestMock).not.toHaveBeenCalled();
  });
});
