import {
  assertPaloAltoNetworksUnlinkKeepsProfileCertificate,
  buildManagedCertNamePattern
} from "./palo-alto-networks-pki-sync-fns";

const SHORT_ID = "3hFkQ9xZr2mVw8LpT0aBcD";

describe("Palo Alto Networks buildManagedCertNamePattern (orphan cleanup detection)", () => {
  test("matches names built from the INF-{{shortCertificateId}} schema", () => {
    const pattern = buildManagedCertNamePattern("INF-{{shortCertificateId}}");
    expect(pattern.test(`INF-${SHORT_ID}`)).toBe(true);
    expect(pattern.test("mgmt-cert")).toBe(false);
  });

  test("never treats the imported CA chain objects as managed leaf certificates", () => {
    const pattern = buildManagedCertNamePattern("INF-{{shortCertificateId}}");
    expect(pattern.test("INF-CA-0123456789abcdef01234567")).toBe(false);
  });
});

describe("Palo Alto Networks SSL/TLS profile unlink check", () => {
  const pkiSync = {
    syncOptions: { canRemoveCertificates: true },
    destinationConfig: { sslTlsServiceProfileName: "mgmt-profile" }
  };
  const check = (overrides: Partial<Parameters<typeof assertPaloAltoNetworksUnlinkKeepsProfileCertificate>[0]>) => () =>
    assertPaloAltoNetworksUnlinkKeepsProfileCertificate({
      pkiSync,
      remainingCertificateCount: 0,
      unlinkedAtDestinationCount: 1,
      ...overrides
    });

  test("rejects removing the profile's last certificate without a replacement", () => {
    expect(check({})).toThrow(/Choose a replacement certificate/);
  });

  test("allows it when a replacement certificate is given", () => {
    expect(check({ removalOptions: { replacementCertificateName: "backup-cert" } })).not.toThrow();
  });

  test("allows it when another certificate remains on the sync", () => {
    expect(check({ remainingCertificateCount: 1 })).not.toThrow();
  });

  test("allows it when nothing unlinked is on the device", () => {
    expect(check({ unlinkedAtDestinationCount: 0 })).not.toThrow();
  });

  test("allows it when the sync does not remove certificates from the device", () => {
    expect(check({ pkiSync: { ...pkiSync, syncOptions: { canRemoveCertificates: false } } })).not.toThrow();
  });
});
