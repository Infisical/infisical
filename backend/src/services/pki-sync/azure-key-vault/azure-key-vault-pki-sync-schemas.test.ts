import { AzureKeyVaultPkiSyncOptionsSchema } from "./azure-key-vault-pki-sync-schemas";

const parseSchema = (certificateNameSchema: string) =>
  AzureKeyVaultPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

describe("Azure Key Vault certificateNameSchema validation", () => {
  test("requires the {{certificateId}} placeholder (prevents author-controlled name collisions)", () => {
    // {{commonName}} alone is certificate-author controlled and could collide with an existing vault object
    expect(parseSchema("{{commonName}}")).toBe(false);
    expect(parseSchema("static-name")).toBe(false);
  });

  test("accepts schemas that include {{certificateId}}", () => {
    expect(parseSchema("Infisical-{{certificateId}}")).toBe(true);
    expect(parseSchema("{{commonName}}-{{certificateId}}")).toBe(true);
  });

  test("rejects characters Azure Key Vault forbids (only alphanumeric + hyphen allowed)", () => {
    // underscores are not allowed in Azure Key Vault certificate names
    expect(parseSchema("{{certificateId}}_x")).toBe(false);
  });

  test("allows an empty/undefined schema (optional)", () => {
    expect(AzureKeyVaultPkiSyncOptionsSchema.safeParse({}).success).toBe(true);
  });
});
