import { getAzureKeyVaultConnectionFederatedCredential } from "./azure-key-vault-connection-fns";

const config = vi.hoisted(() => ({ SITE_URL: "https://app.test" as string | undefined }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => config }));

const connection = { id: "11111111-1111-1111-1111-111111111111", orgId: "22222222-2222-2222-2222-222222222222" };

describe("getAzureKeyVaultConnectionFederatedCredential", () => {
  afterEach(() => {
    config.SITE_URL = "https://app.test";
  });

  test("returns the values to add to the federated credential", () => {
    expect(getAzureKeyVaultConnectionFederatedCredential(connection)).toEqual({
      issuerUrl: `https://app.test/api/v1/oidc-issuer/organizations/${connection.orgId}`,
      subjectIdentifier: `app-connection:${connection.id}`,
      audience: "api://AzureADTokenExchange"
    });
  });

  test("returns no issuer when SITE_URL is not set", () => {
    config.SITE_URL = undefined;

    expect(getAzureKeyVaultConnectionFederatedCredential(connection).issuerUrl).toBeNull();
  });
});
