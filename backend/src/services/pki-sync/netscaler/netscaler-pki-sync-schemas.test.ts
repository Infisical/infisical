import { NetScalerPkiSyncOptionsSchema } from "./netscaler-pki-sync-schemas";

const parseSchema = (certificateNameSchema: string) =>
  NetScalerPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

describe("NetScaler certificateNameSchema validation", () => {
  test("accepts the supported placeholders that fit the 63-char limit", () => {
    expect(parseSchema("Infisical-{{certificateId}}")).toBe(true); // 42 chars
    expect(parseSchema("{{commonName}}-{{certificateId}}")).toBe(true); // ~44 chars
    expect(parseSchema("{{applicationName}}-{{certificateId}}")).toBe(true);
  });

  test("accepts {{shortCertificateId}}, which fits where two full UUID placeholders would not", () => {
    expect(parseSchema("Infisical-{{shortCertificateId}}")).toBe(true);
    expect(parseSchema("{{applicationId}}-{{shortCertificateId}}")).toBe(true);
  });

  test("requires the {{certificateId}} or {{shortCertificateId}} placeholder", () => {
    expect(parseSchema("{{commonName}}")).toBe(false);
    expect(parseSchema("static-name")).toBe(false);
    expect(parseSchema("{{profileId}}-{{applicationId}}")).toBe(false);
  });

  test("rejects the removed placeholders", () => {
    expect(parseSchema("{{certificateId}}-{{environment}}")).toBe(false);
    expect(parseSchema("{{friendlyName}}-{{certificateId}}")).toBe(false);
  });

  test("rejects schemas that would produce characters NetScaler forbids", () => {
    // '*' is a forbidden NetScaler certkey character.
    expect(parseSchema("*-{{certificateId}}")).toBe(false);
  });

  test("rejects schemas that compile beyond NetScaler's 63-char limit", () => {
    // two 32-char full UUID placeholders + separator = 65 chars > 63
    expect(parseSchema("{{profileId}}-{{certificateId}}")).toBe(false);
    expect(parseSchema("{{applicationId}}-{{certificateId}}")).toBe(false);
  });

  test("requires a schema (rejects empty/undefined)", () => {
    expect(NetScalerPkiSyncOptionsSchema.safeParse({}).success).toBe(false);
    expect(parseSchema("")).toBe(false);
  });
});
