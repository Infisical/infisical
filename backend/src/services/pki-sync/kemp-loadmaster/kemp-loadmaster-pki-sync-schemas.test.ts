import {
  KempLoadMasterPkiSyncConfigSchema,
  KempLoadMasterPkiSyncOptionsSchema
} from "./kemp-loadmaster-pki-sync-schemas";

const parseOptions = (overrides: Record<string, unknown>) =>
  KempLoadMasterPkiSyncOptionsSchema.safeParse({ certificateNameSchema: "Infisical-{{certificateId}}", ...overrides });

describe("Kemp LoadMaster certificateNameSchema validation", () => {
  const accepts = (certificateNameSchema: string) =>
    KempLoadMasterPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

  test("accepts the supported placeholders", () => {
    expect(accepts("Infisical-{{certificateId}}")).toBe(true);
    expect(accepts("{{commonName}}-{{certificateId}}")).toBe(true);
    expect(accepts("{{shortCertificateId}}")).toBe(true);
    expect(accepts("static-name")).toBe(true);
  });

  test("rejects characters the LoadMaster forbids", () => {
    expect(accepts("*-{{certificateId}}")).toBe(false);
    expect(accepts("cert with space")).toBe(false);
    expect(accepts("cert/slash")).toBe(false);
  });

  test("rejects identifiers longer than 251 characters", () => {
    expect(accepts("a".repeat(251))).toBe(true);
    expect(accepts("a".repeat(252))).toBe(false);
  });
});

describe("Kemp LoadMaster caCertificateNameSchema + syncCaCertificates", () => {
  const acceptsCa = (caCertificateNameSchema: string) => parseOptions({ caCertificateNameSchema }).success;

  test("applies sensible defaults when omitted", () => {
    const result = parseOptions({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.syncCaCertificates).toBe(true);
      expect(result.data.caCertificateNameSchema).toBe("Infisical-ca-{{fingerprint}}");
    }
  });

  test("does not force any placeholder (user names CAs freely, like the certificate schema)", () => {
    expect(acceptsCa("Infisical-ca-{{fingerprint}}")).toBe(true);
    expect(acceptsCa("Infisical-ca-{{commonName}}")).toBe(true);
    expect(acceptsCa("{{commonName}}-{{fingerprint}}")).toBe(true);
    expect(acceptsCa("static-ca-name")).toBe(true);
  });

  test("rejects forbidden characters and over-length names", () => {
    expect(acceptsCa("ca!-{{fingerprint}}")).toBe(false);
    expect(acceptsCa("ca space-{{fingerprint}}")).toBe(false);
    expect(acceptsCa(`${"a".repeat(230)}-{{fingerprint}}`)).toBe(false); // 230 + 1 + 24 = 255 > 251
  });
});

describe("Kemp LoadMaster destinationConfig (virtualServiceId)", () => {
  const accepts = (config: Record<string, unknown>) => KempLoadMasterPkiSyncConfigSchema.safeParse(config).success;

  test("accepts a numeric Virtual Service index or none at all", () => {
    expect(accepts({})).toBe(true);
    expect(accepts({ virtualServiceId: "1" })).toBe(true);
    expect(accepts({ virtualServiceId: "42" })).toBe(true);
  });

  test("rejects non-numeric Virtual Service identifiers", () => {
    expect(accepts({ virtualServiceId: "vs-ssl-prod" })).toBe(false);
    expect(accepts({ virtualServiceId: "1.2" })).toBe(false);
    expect(accepts({ virtualServiceId: "172.31.34.251:443" })).toBe(false);
  });
});
