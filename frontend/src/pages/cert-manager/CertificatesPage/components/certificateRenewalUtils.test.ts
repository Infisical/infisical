import { describe, expect, it } from "vitest";

import { CertificateRenewalKeySource } from "@app/hooks/api/certificates/enums";
import {
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import {
  buildRenewalFormDefaults,
  buildRenewalRequestAttributes,
  capTtlToDays,
  getRemovedCertificateNames
} from "./certificateRenewalUtils";

const certificate = {
  id: "cert-1",
  commonName: "ca-rewrote.example.com",
  altNames: "ca-added.example.com",
  subject: { organization: "Issuer Corp", country: "US" },
  keyUsages: ["digitalSignature", "keyEncipherment"],
  extendedKeyUsages: ["serverAuth"],
  keyAlgorithm: "RSA_2048",
  signatureAlgorithm: "RSA-SHA384",
  notBefore: "2026-01-01T00:00:00Z",
  notAfter: "2026-01-31T00:00:00Z",
  customExtensions: []
} as never;

const constraints = {
  allowedSanTypes: [CertSubjectAlternativeNameType.DNS_NAME],
  shouldShowSubjectSection: true,
  shouldShowSanSection: true,
  templateAllowsCA: false
} as never;

const renewalPreview = {
  hasOriginatingRequest: true,
  hasOriginatingCsr: true,
  request: {
    commonName: "asked-for.example.com",
    altNames: [],
    keyUsages: ["digital_signature"],
    extendedKeyUsages: ["client_auth"],
    keyAlgorithm: "RSA_2048",
    signatureAlgorithm: "RSA-SHA256",
    customExtensions: [{ oid: "1.3.6.1.4.1.99001.1", value: "asked-for", critical: true }]
  },
  issuerModifiedFields: []
};

describe("buildRenewalFormDefaults", () => {
  it("seeds from the originating request, not from what the authority issued", () => {
    const defaults = buildRenewalFormDefaults(certificate, constraints, renewalPreview);

    expect(defaults.subjectAttributes?.map((attr) => attr.value)).toEqual([
      "asked-for.example.com"
    ]);
    expect(defaults.subjectAltNames).toEqual([]);
    expect(defaults.signatureAlgorithm).toBe("RSA-SHA256");
    expect(defaults.keyUsages).toEqual({ digital_signature: true });
    expect(defaults.extendedKeyUsages).toEqual({ client_auth: true });
    expect(defaults.customExtensions).toEqual([
      { oid: "1.3.6.1.4.1.99001.1", value: "asked-for", critical: true }
    ]);
  });

  it("falls back to the certificate when no request lies behind it, for imports and discovery", () => {
    const defaults = buildRenewalFormDefaults(certificate, constraints, {
      ...renewalPreview,
      hasOriginatingRequest: false
    });

    expect(defaults.subjectAttributes?.map((attr) => attr.value)).toContain(
      "ca-rewrote.example.com"
    );
    expect(defaults.subjectAltNames?.map((san) => san.value)).toEqual(["ca-added.example.com"]);
    expect(defaults.signatureAlgorithm).toBe("RSA-SHA384");
  });
});

describe("getRemovedCertificateNames", () => {
  const reissuedCertificate = {
    commonName: "example.com",
    altNames: "example.com,www.example.com"
  };
  const shownSections = { shouldShowSubjectSection: true, shouldShowSanSection: true };
  const formWith = (commonName: string, altNames: string[]) => ({
    subjectAttributes: [{ type: CertSubjectAttributeType.COMMON_NAME, value: commonName }],
    subjectAltNames: altNames.map((value) => ({
      type: CertSubjectAlternativeNameType.DNS_NAME,
      value
    }))
  });

  it("lists nothing when every name is kept, ignoring case and order", () => {
    expect(
      getRemovedCertificateNames({
        certificate: reissuedCertificate,
        formData: formWith("Example.com", ["new.example.com", "WWW.example.com", "example.com"]),
        constraints: shownSections
      })
    ).toEqual([]);
  });

  it("lists an alternative name that is dropped", () => {
    expect(
      getRemovedCertificateNames({
        certificate: reissuedCertificate,
        formData: formWith("example.com", ["example.com"]),
        constraints: shownSections
      })
    ).toEqual(["www.example.com"]);
  });

  it("lists the common name when it changes", () => {
    expect(
      getRemovedCertificateNames({
        certificate: { commonName: "example.com", altNames: "www.example.com" },
        formData: formWith("other.example.com", ["www.example.com"]),
        constraints: shownSections
      })
    ).toEqual(["example.com"]);
  });

  it("keeps the current names of a section the policy hides", () => {
    expect(
      getRemovedCertificateNames({
        certificate: reissuedCertificate,
        formData: formWith("example.com", []),
        constraints: { shouldShowSubjectSection: true, shouldShowSanSection: false }
      })
    ).toEqual([]);
  });
});

describe("buildRenewalRequestAttributes", () => {
  it("submits policy-required usages even when their checkboxes were never toggled", () => {
    const formData = {
      ...buildRenewalFormDefaults(certificate, constraints),
      keySource: CertificateRenewalKeySource.New,
      keyUsages: { key_agreement: true, key_encipherment: false },
      extendedKeyUsages: {}
    };

    const attributes = buildRenewalRequestAttributes({
      formData,
      constraints: {
        ...(constraints as object),
        requiredKeyUsages: ["digital_signature"],
        requiredExtendedKeyUsages: ["client_auth"]
      } as never
    });

    expect(attributes.keyUsages).toEqual(["key_agreement", "digital_signature"]);
    expect(attributes.extendedKeyUsages).toEqual(["client_auth"]);
  });

  it("sends only what a CSR renewal accepts when reuse renews from the stored CSR", () => {
    const formData = {
      ...buildRenewalFormDefaults(certificate, constraints),
      keySource: CertificateRenewalKeySource.Reuse,
      renewsFromStoredCsr: true,
      ttl: "30d"
    };

    expect(buildRenewalRequestAttributes({ formData, constraints })).toEqual({
      ttl: "30d",
      customExtensions: []
    });
  });

  it.each([
    [
      "reuse from the stored CSR",
      { keySource: CertificateRenewalKeySource.Reuse, renewsFromStoredCsr: true }
    ],
    ["a supplied CSR", { keySource: CertificateRenewalKeySource.Csr, renewsFromStoredCsr: false }]
  ])("sends no validity for %s when the CA takes it from its template", (_label, mode) => {
    const formData = { ...buildRenewalFormDefaults(certificate, constraints), ...mode, ttl: "30d" };

    expect(
      buildRenewalRequestAttributes({ formData, constraints, isExternalTemplateProfile: true })
    ).toEqual({ customExtensions: [] });
  });

  it("sends the subject and usages when reuse renews from the private key Infisical holds", () => {
    const formData = {
      ...buildRenewalFormDefaults(certificate, constraints),
      keySource: CertificateRenewalKeySource.Reuse,
      renewsFromStoredCsr: false
    };

    const attributes = buildRenewalRequestAttributes({ formData, constraints });

    expect(attributes.commonName).toBe("ca-rewrote.example.com");
    expect(attributes.altNames).toBeDefined();
    expect(attributes.keyUsages).toBeDefined();
  });
});

describe("capTtlToDays", () => {
  it("caps a longer lifetime at the limit", () => {
    expect(capTtlToDays("365d", 199)).toBe("199d");
  });

  it("keeps a lifetime within the limit", () => {
    expect(capTtlToDays("85d", 199)).toBe("85d");
    expect(capTtlToDays("12h", 199)).toBe("12h");
  });
});
