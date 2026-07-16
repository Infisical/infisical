import { DYNAMIC_SECRET_PROVIDER_OUTPUTS } from "../dynamic-secret/providers/dynamic-secret-provider-outputs";
import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { BROKERABLE_DYNAMIC_SECRET_OUTPUTS } from "./proxied-service-brokerable-outputs";

describe("BROKERABLE_DYNAMIC_SECRET_OUTPUTS", () => {
  it("allows 12 providers for HTTP brokering", () => {
    expect(Object.keys(BROKERABLE_DYNAMIC_SECRET_OUTPUTS)).toHaveLength(12);
  });

  it("only lists fields that the provider actually outputs", () => {
    Object.entries(BROKERABLE_DYNAMIC_SECRET_OUTPUTS).forEach(([provider, fields]) => {
      const { outputFields } = DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider as DynamicSecretProviders];
      fields?.forEach((field) => expect(outputFields).toContain(field));
    });
  });

  it("does not broker database/ssh providers or metadata fields", () => {
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.SqlDatabase]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.AwsIam]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.Ssh]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.Github]).toEqual(["TOKEN"]);
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.Totp]).toEqual(["TOTP"]);
  });
});
