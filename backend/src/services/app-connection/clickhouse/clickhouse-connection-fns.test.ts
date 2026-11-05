import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";

import { ClickHouseClient } from "@clickhouse/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";

import { executeClickHouseStatement, executeWithClickHouseClient } from "./clickhouse-connection-fns";

const state = vi.hoisted(() => ({ agentRequests: [] as unknown[][], proxyOptions: [] as unknown[] }));

vi.mock("@app/lib/validator", () => ({
  buildUncachedSsrfSafeAgent: async (...args: unknown[]) => {
    state.agentRequests.push(args);
    return undefined;
  }
}));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: async ({ host }: { host: string }) => [host]
}));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: async (callback: (port: number) => Promise<unknown>, options: unknown) => {
    state.proxyOptions.push(options);
    return callback(54321);
  }
}));

const CREDENTIALS = {
  host: "clickhouse.example.com",
  port: 8443,
  database: "default",
  username: "manager",
  password: "manager-password",
  sslEnabled: true,
  sslRejectUnauthorized: true
};
const GATEWAY_ID = "3c90c3cc-0d44-4b50-8888-8dd25736052a";
const GATEWAY_POOL_ID = "8f0c3a8e-5b1d-4d6e-9c2a-1e7f4b6d2a90";

const gatewayReturning = (details: unknown) => {
  const getPlatformConnectionDetailsByGatewayId = vi.fn(async () => details);
  return {
    getPlatformConnectionDetailsByGatewayId,
    gatewayDeps: {
      gatewayV2Service: { getPlatformConnectionDetailsByGatewayId },
      gatewayPoolService: { resolveEffectiveGatewayId: async () => GATEWAY_ID }
    } as unknown as Parameters<typeof executeWithClickHouseClient>[1]
  };
};

const respondWith = (body: Buffer, statusCode: number, headers: Record<string, string> = {}) =>
  ({
    exec: async () => ({ stream: Readable.from([body]), http_status_code: statusCode, response_headers: headers })
  }) as unknown as ClickHouseClient;

describe("executeClickHouseStatement", () => {
  it("resolves on a successful response", async () => {
    await expect(executeClickHouseStatement(respondWith(Buffer.from("1\n"), 200), "SELECT 1")).resolves.toBeUndefined();
  });

  it("throws the error ClickHouse returns", async () => {
    const error = Buffer.from("Code: 516. DB::Exception: manager: Authentication failed. (AUTHENTICATION_FAILED)");

    await expect(executeClickHouseStatement(respondWith(error, 516), "SELECT 1")).rejects.toThrow(
      "Authentication failed"
    );
  });

  it("stops reading a response larger than 1 MB", async () => {
    const response = respondWith(Buffer.alloc(2 * 1024 * 1024), 500);

    await expect(executeClickHouseStatement(response, "SELECT 1")).rejects.toThrow("larger than 1 MB");
  });

  it("refuses a small gzip error response that decompresses past 1 MB", async () => {
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024));
    const response = respondWith(bomb, 500, { "content-encoding": "gzip" });

    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(executeClickHouseStatement(response, "SELECT 1")).rejects.toThrow("couldn't read");
  });
});

describe("executeWithClickHouseClient", () => {
  beforeEach(() => {
    state.agentRequests = [];
    state.proxyOptions = [];
  });

  it("connects directly through an agent pinned to the host when there is no gateway", async () => {
    const { gatewayDeps } = gatewayReturning(undefined);

    await executeWithClickHouseClient({ credentials: CREDENTIALS }, gatewayDeps, async () => undefined);

    expect(state.agentRequests).toEqual([
      ["https://clickhouse.example.com:8443", { ca: undefined, rejectUnauthorized: true }]
    ]);
  });

  it("brackets IPv6 hosts in the URL", async () => {
    const { gatewayDeps } = gatewayReturning(undefined);

    await executeWithClickHouseClient(
      { credentials: { ...CREDENTIALS, host: "2001:db8::10" } },
      gatewayDeps,
      async () => undefined
    );

    expect(state.agentRequests[0][0]).toBe("https://[2001:db8::10]:8443");
  });

  it("connects through the gateway proxy and still verifies TLS against the real host", async () => {
    const { gatewayDeps, getPlatformConnectionDetailsByGatewayId } = gatewayReturning({ relayHost: "relay" });

    await executeWithClickHouseClient(
      { credentials: CREDENTIALS, gatewayId: GATEWAY_ID },
      gatewayDeps,
      async () => undefined
    );

    expect(getPlatformConnectionDetailsByGatewayId).toHaveBeenCalledWith({
      gatewayId: GATEWAY_ID,
      targetHost: "clickhouse.example.com",
      targetPort: 8443
    });
    expect(state.proxyOptions).toEqual([{ protocol: GatewayProxyProtocol.Tcp, relayHost: "relay" }]);
    expect(state.agentRequests).toEqual([
      [
        "https://localhost:54321",
        { ca: undefined, rejectUnauthorized: true, allowPrivateIps: true, servername: "clickhouse.example.com" }
      ]
    ]);
  });

  it("resolves a gateway pool to one of its gateways before connecting", async () => {
    const { gatewayDeps, getPlatformConnectionDetailsByGatewayId } = gatewayReturning({ relayHost: "relay" });

    await executeWithClickHouseClient(
      { credentials: CREDENTIALS, gatewayPoolId: GATEWAY_POOL_ID },
      gatewayDeps,
      async () => undefined
    );

    expect(getPlatformConnectionDetailsByGatewayId).toHaveBeenCalledWith({
      gatewayId: GATEWAY_ID,
      targetHost: "clickhouse.example.com",
      targetPort: 8443
    });
  });

  it("refuses to connect directly when the gateway is missing", async () => {
    const { gatewayDeps } = gatewayReturning(undefined);
    const operation = vi.fn();

    await expect(
      executeWithClickHouseClient({ credentials: CREDENTIALS, gatewayId: GATEWAY_ID }, gatewayDeps, operation)
    ).rejects.toThrow(NotFoundError);
    expect(operation).not.toHaveBeenCalled();
    expect(state.agentRequests).toEqual([]);
  });
});
