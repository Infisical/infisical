import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { BROKERABLE_DYNAMIC_SECRETS } from "./proxied-service-brokerable-outputs";

describe("BROKERABLE_DYNAMIC_SECRETS", () => {
  it("allows 12 providers for HTTP brokering", () => {
    expect(Object.keys(BROKERABLE_DYNAMIC_SECRETS)).toHaveLength(12);
  });

  it("every allowed provider lists at least one field", () => {
    Object.values(BROKERABLE_DYNAMIC_SECRETS).forEach((entry) => {
      expect(entry?.fields.length).toBeGreaterThan(0);
    });
  });

  it("does not broker database/ssh providers or metadata fields", () => {
    expect(BROKERABLE_DYNAMIC_SECRETS[DynamicSecretProviders.SqlDatabase]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRETS[DynamicSecretProviders.AwsIam]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRETS[DynamicSecretProviders.Ssh]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRETS[DynamicSecretProviders.Github]?.fields).toEqual(["TOKEN"]);
    expect(BROKERABLE_DYNAMIC_SECRETS[DynamicSecretProviders.Totp]?.fields).toEqual(["TOTP"]);
  });
});
