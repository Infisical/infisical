import {
  PaloAltoNetworksPkiSyncConfigSchema,
  PaloAltoNetworksPkiSyncOptionsSchema,
  PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema
} from "./palo-alto-networks-pki-sync-schemas";

const parseNameSchema = (certificateNameSchema: string) =>
  PaloAltoNetworksPkiSyncOptionsSchema.safeParse({ certificateNameSchema }).success;

describe("Palo Alto Networks certificateNameSchema validation", () => {
  test("accepts the default and short-id schemas within the 31-char Panorama limit", () => {
    expect(parseNameSchema("INF-{{shortCertificateId}}")).toBe(true);
    expect(parseNameSchema("web-{{shortCertificateId}}")).toBe(true);
  });

  test("rejects schemas that compile beyond 31 characters", () => {
    expect(parseNameSchema("{{certificateId}}")).toBe(false);
    expect(parseNameSchema("Infisical-{{shortCertificateId}}")).toBe(false);
  });

  test("rejects periods, which PAN-OS certificate names do not allow", () => {
    expect(parseNameSchema("web.{{shortCertificateId}}")).toBe(false);
  });
});

describe("Palo Alto Networks destination config validation", () => {
  test("certificates sync accepts a firewall config and defaults push to devices on", () => {
    expect(PaloAltoNetworksPkiSyncConfigSchema.parse({}).pushToDevices).toBe(true);
  });

  test("SSL/TLS profile sync requires a profile and accepts a template vsys", () => {
    expect(PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema.safeParse({ template: "branch-tpl" }).success).toBe(false);
    expect(
      PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema.safeParse({
        template: "branch-tpl",
        sslTlsServiceProfileName: "gp-portal-profile",
        sslTlsServiceProfileVsys: "vsys1"
      }).success
    ).toBe(true);
  });

  test("rejects names that could break out of an XPath predicate", () => {
    expect(PaloAltoNetworksPkiSyncConfigSchema.safeParse({ template: "a']/../entry[@name='b" }).success).toBe(false);
    expect(
      PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema.safeParse({ sslTlsServiceProfileName: "p<x/>" }).success
    ).toBe(false);
  });
});
