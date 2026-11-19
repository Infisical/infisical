import {
  AzureAppConfigurationSyncSchema,
  CreateAzureAppConfigurationSyncSchema
} from "./azure-app-configuration-sync-schemas";

const createConfigSchema = CreateAzureAppConfigurationSyncSchema.shape.destinationConfig;
const responseConfigSchema = AzureAppConfigurationSyncSchema.shape.destinationConfig;

describe("Azure App Configuration sync destination config", () => {
  test("rejects a configuration URL that is not a store endpoint", () => {
    const result = createConfigSchema.safeParse({ configurationUrl: "https://example.com/store.azconfig.io" });

    expect(result.error?.issues[0].message).toBe(
      "App Configuration URL must be a valid Azure App Configuration URL (https://<store-name>.azconfig.io)"
    );
  });

  test("still reads a stored configuration URL saved before the check", () => {
    expect(responseConfigSchema.safeParse({ configurationUrl: "http://store.azconfig.io" }).success).toBe(true);
  });
});
