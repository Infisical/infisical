import { requestWithHCVaultGateway } from "@app/services/app-connection/hc-vault";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";

import { HCVaultSyncFns } from "./hc-vault-sync-fns";
import { THCVaultSyncWithCredentials } from "./hc-vault-sync-types";

vi.mock("@app/services/app-connection/hc-vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/services/app-connection/hc-vault")>();
  return {
    ...actual,
    getHCVaultAccessToken: vi.fn(() => Promise.resolve("vault-token")),
    getHCVaultInstanceUrl: vi.fn(() => Promise.resolve("https://vault.example.com")),
    requestWithHCVaultGateway: vi.fn()
  };
});

const requestMock = vi.mocked(requestWithHCVaultGateway);

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn(() => Promise.resolve(null)) };

const buildSync = (mount: string, path: string) =>
  ({
    connection: { gatewayId: null, gatewayPoolId: null, credentials: {} },
    destinationConfig: { mount, path }
  }) as unknown as THCVaultSyncWithCredentials;

const mountsResponse = (mounts: Record<string, { type: string; version?: string }>) => ({
  data: {
    data: Object.fromEntries(
      Object.entries(mounts).map(([mountPath, { type, version }]) => [
        mountPath,
        { type, options: version ? { version } : null }
      ])
    )
  }
});

const requestedUrls = () => requestMock.mock.calls.map(([, , config]) => config.url);

describe("HCVaultSyncFns.getSecrets", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  test("reads a KV v2 path under its data prefix", async () => {
    requestMock
      .mockResolvedValueOnce(mountsResponse({ "kv/": { type: "kv", version: "2" } }) as never)
      .mockResolvedValueOnce({ data: { data: { data: { API_KEY: "value" } } } } as never);

    const secrets = await HCVaultSyncFns.getSecrets(buildSync("kv", "team/app"), gatewayV2Service, gatewayPoolService);

    expect(secrets).toEqual({ API_KEY: { value: "value" } });
    expect(requestedUrls()).toEqual([
      "https://vault.example.com/v1/sys/mounts",
      "https://vault.example.com/v1/kv/data/team/app"
    ]);
  });

  test("reads a legacy 'generic' mount as KV v1, without the data prefix", async () => {
    requestMock
      .mockResolvedValueOnce(mountsResponse({ "legacy/": { type: "generic" } }) as never)
      .mockResolvedValueOnce({ data: { data: { API_KEY: "value" } } } as never);

    const secrets = await HCVaultSyncFns.getSecrets(
      buildSync("legacy", "team/app"),
      gatewayV2Service,
      gatewayPoolService
    );

    expect(secrets).toEqual({ API_KEY: { value: "value" } });
    expect(requestedUrls()).toEqual([
      "https://vault.example.com/v1/sys/mounts",
      "https://vault.example.com/v1/legacy/team/app"
    ]);
  });

  test("refuses a mount that is not a KV secrets engine", async () => {
    requestMock.mockResolvedValueOnce(mountsResponse({ "database/": { type: "database" } }) as never);

    const result = HCVaultSyncFns.getSecrets(buildSync("database", "team/app"), gatewayV2Service, gatewayPoolService);

    await expect(result).rejects.toBeInstanceOf(SecretSyncError);
    await expect(result).rejects.toThrowError(/is a 'database' engine/);
    expect(requestedUrls()).toEqual(["https://vault.example.com/v1/sys/mounts"]);
  });

  test.each(["kv/..", "../kv", "%2e%2e"])(
    "refuses a stored mount with a dot segment ('%s') before any request",
    async (mount) => {
      const result = HCVaultSyncFns.getSecrets(buildSync(mount, "team/app"), gatewayV2Service, gatewayPoolService);

      await expect(result).rejects.toBeInstanceOf(SecretSyncError);
      await expect(result).rejects.toThrowError(/Secrets engine mount .* cannot contain '\.' or '\.\.' path segments/);
      expect(requestedUrls()).toEqual([]);
    }
  );

  test.each(["../other", "app/../../b", "%2e%2e/%2e%2e/other"])(
    "refuses a stored path with a dot segment ('%s') before requesting it",
    async (path) => {
      requestMock.mockResolvedValueOnce(mountsResponse({ "kv/": { type: "kv", version: "2" } }) as never);

      const result = HCVaultSyncFns.getSecrets(buildSync("kv", path), gatewayV2Service, gatewayPoolService);

      await expect(result).rejects.toThrowError(/cannot contain '\.' or '\.\.' path segments/);
      expect(requestedUrls()).toEqual(["https://vault.example.com/v1/sys/mounts"]);
    }
  );
});
