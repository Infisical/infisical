import { TSecretSyncPayload } from "../secret-sync-payload";
import { azureAppConfigurationSyncFactory } from "./azure-app-configuration-sync-fns";
import { TAzureAppConfigurationSyncWithCredentials } from "./azure-app-configuration-sync-types";

const { getAzureConnectionAccessToken } = vi.hoisted(() => ({ getAzureConnectionAccessToken: vi.fn() }));
vi.mock("@app/services/app-connection/azure-key-vault/azure-key-vault-connection-fns", () => ({
  getAzureConnectionAccessToken
}));

const fns = azureAppConfigurationSyncFactory({} as Parameters<typeof azureAppConfigurationSyncFactory>[0]);

const sync = {
  connectionId: "connection-id",
  destinationConfig: { configurationUrl: "https://example.com/store.azconfig.io" }
} as unknown as TAzureAppConfigurationSyncWithCredentials;

const payload = { flatten: () => ({ KEY: { value: "value" } }) } as unknown as TSecretSyncPayload;

describe("azureAppConfigurationSyncFactory", () => {
  beforeEach(() => vi.resetAllMocks());

  test.each([
    ["syncSecrets", () => fns.syncSecrets(sync, payload)],
    ["removeSecrets", () => fns.removeSecrets(sync, payload)],
    ["getSecrets", () => fns.getSecrets(sync)]
  ])("%s refuses a URL that is not a store endpoint, without retrying or fetching a token", async (_, run) => {
    await expect(run()).rejects.toMatchObject({
      message: "Invalid Azure App Configuration URL. Use the store endpoint, https://<store-name>.azconfig.io.",
      shouldRetry: false
    });
    expect(getAzureConnectionAccessToken).not.toHaveBeenCalled();
  });
});
