import { DYNAMIC_SECRET_PROVIDER_OUTPUTS } from "./dynamic-secret-provider-outputs";
import { DynamicSecretProviders } from "./models";

describe("DYNAMIC_SECRET_PROVIDER_OUTPUTS", () => {
  it("has an entry for every provider", () => {
    Object.values(DynamicSecretProviders).forEach((provider) => {
      expect(DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider]).toBeDefined();
    });
  });

  it("lists at least one output field for every provider (nothing is force-hidden)", () => {
    Object.values(DynamicSecretProviders).forEach((provider) => {
      expect(DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider].outputFields.length).toBeGreaterThan(0);
    });
  });

  it("exposes ssh key/cert fields for injection (e.g. into a request body)", () => {
    expect(DYNAMIC_SECRET_PROVIDER_OUTPUTS[DynamicSecretProviders.Ssh].outputFields).toEqual([
      "PRIVATE_KEY",
      "SIGNED_KEY"
    ]);
  });

  it("keeps the lowercase output-field oddballs verbatim", () => {
    expect(DYNAMIC_SECRET_PROVIDER_OUTPUTS[DynamicSecretProviders.AzureEntraID].outputFields).toEqual([
      "email",
      "password"
    ]);
    expect(DYNAMIC_SECRET_PROVIDER_OUTPUTS[DynamicSecretProviders.Couchbase].outputFields).toEqual([
      "username",
      "password"
    ]);
  });

  it("only attaches a lease config schema to kubernetes and ssh", () => {
    Object.values(DynamicSecretProviders).forEach((provider) => {
      const { leaseConfigSchema } = DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider];
      if (provider === DynamicSecretProviders.Kubernetes || provider === DynamicSecretProviders.Ssh) {
        expect(leaseConfigSchema).toBeDefined();
      } else {
        expect(leaseConfigSchema).toBeUndefined();
      }
    });
  });

  it("validates the kubernetes namespace lease config", () => {
    const schema = DYNAMIC_SECRET_PROVIDER_OUTPUTS[DynamicSecretProviders.Kubernetes].leaseConfigSchema!;
    expect(schema.safeParse({ namespace: "prod" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ unknown: "x" }).success).toBe(false);
  });
});
