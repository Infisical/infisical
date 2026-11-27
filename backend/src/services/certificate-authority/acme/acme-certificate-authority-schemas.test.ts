import { describe, expect, it } from "vitest";

import { AcmeDnsProvider } from "./acme-certificate-authority-enums";
import { AcmeCertificateAuthorityConfigurationSchema } from "./acme-certificate-authority-schemas";

const baseConfiguration = {
  dnsAppConnectionId: "4b6b6f4e-6f8a-4a43-9d07-2c4a0a6c2d11",
  directoryUrl: "https://acme-v02.api.letsencrypt.org/directory",
  accountEmail: "pki@example.com"
};

describe("AcmeCertificateAuthorityConfigurationSchema", () => {
  it("still requires a hosted zone for providers that cannot detect it", () => {
    for (const provider of Object.values(AcmeDnsProvider).filter((value) => value !== AcmeDnsProvider.Rfc2136)) {
      const result = AcmeCertificateAuthorityConfigurationSchema.safeParse({
        ...baseConfiguration,
        dnsProviderConfig: { provider, hostedZoneId: " " }
      });
      expect(result.success, provider).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["dnsProviderConfig", "hostedZoneId"]);
    }
  });

  it("requires the zone field for every provider, including RFC 2136", () => {
    expect(
      AcmeCertificateAuthorityConfigurationSchema.safeParse({
        ...baseConfiguration,
        dnsProviderConfig: { provider: AcmeDnsProvider.Rfc2136 }
      }).success
    ).toBe(false);
    expect(
      AcmeCertificateAuthorityConfigurationSchema.safeParse({
        ...baseConfiguration,
        dnsProviderConfig: { provider: AcmeDnsProvider.Cloudflare }
      }).success
    ).toBe(false);
  });

  it("lets RFC 2136 leave the zone empty for detection", () => {
    const result = AcmeCertificateAuthorityConfigurationSchema.safeParse({
      ...baseConfiguration,
      dnsProviderConfig: { provider: AcmeDnsProvider.Rfc2136, hostedZoneId: "" }
    });
    expect(result.success).toBe(true);
  });
});
