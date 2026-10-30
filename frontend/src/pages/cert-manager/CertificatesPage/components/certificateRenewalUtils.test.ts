import { describe, expect, it } from "vitest";

import { CertificateRenewalKeySource } from "@app/hooks/api/certificates/enums";
import { CertSubjectAlternativeNameType } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { buildRenewalFormDefaults, buildRenewalRequestAttributes } from "./certificateRenewalUtils";

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
});
