import { DynamicSecretProviders } from "../dynamic-secret/providers/models";
import { BROKERABLE_DYNAMIC_SECRET_OUTPUTS } from "./proxied-service-brokerable-outputs";

describe("BROKERABLE_DYNAMIC_SECRET_OUTPUTS", () => {
  it("allows 12 providers for HTTP brokering", () => {
    expect(Object.keys(BROKERABLE_DYNAMIC_SECRET_OUTPUTS)).toHaveLength(12);
  });

  it("does not broker database/ssh providers or metadata fields", () => {
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.SqlDatabase]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.AwsIam]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.Ssh]).toBeUndefined();
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.Github]).toEqual(["TOKEN"]);
    expect(BROKERABLE_DYNAMIC_SECRET_OUTPUTS[DynamicSecretProviders.Totp]).toEqual(["TOTP"]);
  });
});
