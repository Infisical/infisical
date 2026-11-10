import { beforeEach, describe, expect, test, vi } from "vitest";

const { send, clientConfigs, appCfg } = vi.hoisted(() => ({
  send: vi.fn(),
  clientConfigs: [] as Record<string, unknown>[],
  appCfg: {} as Record<string, string | undefined>
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: vi.fn(function STSClient(config: Record<string, unknown>) {
    clientConfigs.push(config);
    return { send, destroy: vi.fn() };
  }),
  GetCallerIdentityCommand: vi.fn()
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => appCfg }));

vi.mock("@app/lib/crypto/cryptography", () => ({ crypto: { isFipsModeEnabled: () => false } }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const { detectInstanceAwsAccountId } = await import("./instance-aws-account");

describe("detectInstanceAwsAccountId", () => {
  beforeEach(() => {
    send.mockReset();
    clientConfigs.length = 0;
    delete appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID;
    delete appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY;
  });

  test("asks STS as the configured App Connection keys, so the account matches the AssumeRole principal", async () => {
    appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID = "AKIAEXAMPLE";
    appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY = "example-secret";
    send.mockResolvedValue({ Account: "123456789012" });

    await expect(detectInstanceAwsAccountId()).resolves.toBe("123456789012");
    expect(clientConfigs[0].credentials).toEqual({
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "example-secret"
    });
  });

  test("falls back to the default credential chain when no keys are configured", async () => {
    send.mockResolvedValue({ Account: "210987654321" });

    await expect(detectInstanceAwsAccountId()).resolves.toBe("210987654321");
    expect(clientConfigs[0].credentials).toBeUndefined();
  });

  test("reports no account when the credential chain finds nothing, as off AWS", async () => {
    send.mockRejectedValue(
      Object.assign(new Error("Could not load credentials"), { name: "CredentialsProviderError" })
    );

    await expect(detectInstanceAwsAccountId()).resolves.toBeUndefined();
  });

  test("reports no account instead of throwing when STS fails", async () => {
    send.mockRejectedValue(Object.assign(new Error("Access denied"), { name: "AccessDenied" }));

    await expect(detectInstanceAwsAccountId()).resolves.toBeUndefined();
  });
});
