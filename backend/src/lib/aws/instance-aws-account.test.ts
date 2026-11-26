import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { send, clientConfigs, appCfg, logger, fips } = vi.hoisted(() => ({
  send: vi.fn(),
  clientConfigs: [] as Record<string, unknown>[],
  appCfg: {} as Record<string, unknown>,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  fips: { enabled: false }
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: vi.fn(function STSClient(config: Record<string, unknown>) {
    clientConfigs.push(config);
    return { send, destroy: vi.fn() };
  }),
  GetCallerIdentityCommand: vi.fn()
}));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => appCfg }));

vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: { isFipsModeEnabled: () => fips.enabled, nativeCrypto: { createHash } }
}));

vi.mock("@app/lib/logger", () => ({ logger }));

const KEYS = { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "example-secret" };
const noCredentials = () =>
  Object.assign(new Error("Could not load credentials"), { name: "CredentialsProviderError" });

// The account cache lives at module level, so each test that uses it starts from a fresh module.
const freshModule = async () => {
  vi.resetModules();
  return import("./instance-aws-account");
};

beforeEach(() => {
  send.mockReset();
  logger.warn.mockReset();
  clientConfigs.length = 0;
  delete appCfg.isTestMode;
  fips.enabled = false;
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("detectInstanceAwsAccountId", () => {
  test("asks STS as the given App Connection keys, so the account matches the AssumeRole principal", async () => {
    const { detectInstanceAwsAccountId } = await freshModule();
    send.mockResolvedValue({ Account: "123456789012" });

    await expect(detectInstanceAwsAccountId(KEYS)).resolves.toEqual({ status: "found", accountId: "123456789012" });
    expect(clientConfigs[0].credentials).toEqual(KEYS);
  });

  test("uses the default credential chain when no keys are given", async () => {
    const { detectInstanceAwsAccountId } = await freshModule();
    send.mockResolvedValue({ Account: "210987654321" });

    await expect(detectInstanceAwsAccountId(undefined)).resolves.toEqual({
      status: "found",
      accountId: "210987654321"
    });
    expect(clientConfigs[0].credentials).toBeUndefined();
  });

  test("reports no credentials when the credential chain finds nothing, as off AWS", async () => {
    const { detectInstanceAwsAccountId } = await freshModule();
    send.mockRejectedValue(noCredentials());

    await expect(detectInstanceAwsAccountId(undefined)).resolves.toEqual({ status: "no-credentials" });
  });

  test("reports a failed lookup, not missing credentials, when STS rejects the request", async () => {
    const { detectInstanceAwsAccountId } = await freshModule();
    send.mockRejectedValue(Object.assign(new Error("The security token is invalid"), { name: "InvalidClientTokenId" }));

    await expect(detectInstanceAwsAccountId(KEYS)).resolves.toEqual({ status: "failed" });
  });

  test("gives up after the timeout, cancels the STS request and logs only the timeout", async () => {
    const { detectInstanceAwsAccountId } = await freshModule();
    let signal: AbortSignal | undefined;
    send.mockImplementation(
      (_command: unknown, options: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.abortSignal;
          signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })
    );

    await expect(detectInstanceAwsAccountId(KEYS, 20)).resolves.toEqual({ status: "failed" });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(signal?.aborted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("gave up after 20ms"));
  });
});

describe("getStsClientConfig", () => {
  test.each([
    ["eu-west-1", true, "us-east-1", true],
    ["ap-southeast-1", true, "us-east-1", true],
    ["us-west-2", true, "us-west-2", true],
    ["ca-central-1", true, "ca-central-1", true],
    ["us-gov-west-1", true, "us-gov-west-1", true],
    ["cn-north-1", true, "cn-north-1", false],
    ["cn-northwest-1", true, "cn-northwest-1", false],
    ["eu-west-1", false, "eu-west-1", false],
    ["cn-north-1", false, "cn-north-1", false]
  ])(
    "region %s with FIPS mode %s calls STS in %s, FIPS endpoint %s",
    async (region, isFipsMode, expectedRegion, fipsEndpoint) => {
      const { getStsClientConfig } = await freshModule();
      vi.stubEnv("AWS_REGION", region);

      expect(getStsClientConfig(isFipsMode)).toEqual({ region: expectedRegion, useFipsEndpoint: fipsEndpoint });
    }
  );

  test("passes the FIPS fallback region and the FIPS endpoint flag to STS", async () => {
    const { detectInstanceAwsAccountId } = await freshModule();
    vi.stubEnv("AWS_REGION", "eu-west-1");
    fips.enabled = true;
    send.mockResolvedValue({ Account: "123456789012" });

    await detectInstanceAwsAccountId(KEYS);

    expect(clientConfigs[0]).toMatchObject({ region: "us-east-1", useFipsEndpoint: true });
  });
});

describe("getInstanceAwsAccountId", () => {
  test("asks STS once and reuses the account while the credentials stay the same", async () => {
    const { getInstanceAwsAccountId } = await freshModule();
    send.mockResolvedValue({ Account: "123456789012" });

    await expect(getInstanceAwsAccountId(KEYS)).resolves.toBe("123456789012");
    await expect(getInstanceAwsAccountId(KEYS)).resolves.toBe("123456789012");

    expect(send).toHaveBeenCalledTimes(1);
  });

  test("asks STS again when the credentials change, including when they are removed", async () => {
    const { getInstanceAwsAccountId } = await freshModule();
    send.mockResolvedValueOnce({ Account: "123456789012" }).mockResolvedValueOnce({ Account: "210987654321" });

    await expect(getInstanceAwsAccountId(KEYS)).resolves.toBe("123456789012");
    await expect(getInstanceAwsAccountId(undefined)).resolves.toBe("210987654321");

    expect(send).toHaveBeenCalledTimes(2);
  });

  test("checks a missing account again only after the recheck interval", async () => {
    const { getInstanceAwsAccountId, AWS_ACCOUNT_RECHECK_MS } = await freshModule();
    vi.useFakeTimers({ toFake: ["Date"] });
    send.mockRejectedValueOnce(noCredentials()).mockResolvedValueOnce({ Account: "210987654321" });

    await expect(getInstanceAwsAccountId(undefined)).resolves.toBeNull();
    await expect(getInstanceAwsAccountId(undefined)).resolves.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(AWS_ACCOUNT_RECHECK_MS + 1);
    await expect(getInstanceAwsAccountId(undefined)).resolves.toBe("210987654321");
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("fails instead of reporting no account when the lookup fails, and tries again on the next request", async () => {
    const { getInstanceAwsAccountId } = await freshModule();
    send
      .mockRejectedValueOnce(Object.assign(new Error("connect ETIMEDOUT"), { name: "TimeoutError" }))
      .mockResolvedValueOnce({ Account: "123456789012" });

    await expect(getInstanceAwsAccountId(KEYS)).rejects.toThrow("couldn't read its AWS account ID from AWS STS");
    await expect(getInstanceAwsAccountId(KEYS)).resolves.toBe("123456789012");
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("shares one lookup between concurrent requests", async () => {
    const { getInstanceAwsAccountId } = await freshModule();
    send.mockResolvedValue({ Account: "123456789012" });

    const results = await Promise.all([getInstanceAwsAccountId(KEYS), getInstanceAwsAccountId(KEYS)]);

    expect(results).toEqual(["123456789012", "123456789012"]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("never calls AWS in test mode", async () => {
    const { getInstanceAwsAccountId } = await freshModule();
    appCfg.isTestMode = true;

    await expect(getInstanceAwsAccountId(KEYS)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
