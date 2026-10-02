import { beforeEach, describe, expect, test, vi } from "vitest";

import { PamAccountType } from "../pam/pam-enums";

const testConnectionWithGateway = vi.fn();

vi.mock("@app/ee/services/gateway-v2/gateway-v2-fns", () => ({
  testConnectionWithGateway: (...args: unknown[]) => testConnectionWithGateway(...args) as unknown,
  rotateSqlCredentialWithGateway: vi.fn()
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { GATEWAY_RETRY_ATTEMPTS } from "./pam-rotation-fns";
// eslint-disable-next-line import/first
import { PAM_ROTATION_FACTORY_MAP } from "./pam-rotation-handlers";

describe("Oracle testCredential distinguishes a rejected credential from an unreachable target", () => {
  const { testCredential } = PAM_ROTATION_FACTORY_MAP[PamAccountType.OracleDB];

  const invoke = () =>
    testCredential(
      {
        accountType: PamAccountType.OracleDB,
        connectionDetails: { host: "db.example.com", port: 2484, database: "FREEPDB1", sslEnabled: true },
        auth: { username: "PAMROT", password: "short-pw" },
        gatewayId: "11111111-1111-1111-1111-111111111111"
      } as never,
      {
        gatewayV2Service: {},
        gatewayPoolService: { resolveEffectiveGatewayId: vi.fn().mockResolvedValue("gw") }
      } as never
    );

  beforeEach(() => testConnectionWithGateway.mockReset());

  test("a null result (gateway unreachable) throws instead of returning false", async () => {
    testConnectionWithGateway.mockResolvedValue(null);
    await expect(invoke()).rejects.toThrow(/could not reach the target/i);
    expect(testConnectionWithGateway).toHaveBeenCalledTimes(GATEWAY_RETRY_ATTEMPTS);
  });

  test("a transport-kind failure throws instead of returning false", async () => {
    testConnectionWithGateway.mockResolvedValue({
      ok: false,
      status: 502,
      errorMessage: "dial tcp",
      kind: "transport"
    });
    await expect(invoke()).rejects.toThrow(/could not reach the target/i);
  });

  test("an auth-kind failure returns false", async () => {
    testConnectionWithGateway.mockResolvedValue({ ok: false, status: 502, errorMessage: "ORA-01017", kind: "auth" });
    await expect(invoke()).resolves.toBe(false);
    expect(testConnectionWithGateway).toHaveBeenCalledTimes(1);
  });

  test("a successful probe returns true", async () => {
    testConnectionWithGateway.mockResolvedValue({ ok: true, status: 200 });
    await expect(invoke()).resolves.toBe(true);
  });
});
