import { describe, expect, it } from "vitest";

import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";
import {
  CertRequestReference,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { buildPolicyRules, evaluateSubjectStep } from "./certificatePolicyGuidance";

const requiredCommonNameSan = (type: CertSubjectAlternativeNameType) =>
  buildPolicyRules({
    sans: [{ type, required: [CertRequestReference.COMMON_NAME] }]
  } as unknown as TCertificatePolicy);

const sanSection = (type: CertSubjectAlternativeNameType, commonName: string, sanValue: string) =>
  evaluateSubjectStep({
    rules: requiredCommonNameSan(type),
    subjectAttributes: [{ type: CertSubjectAttributeType.COMMON_NAME, value: commonName }],
    subjectAltNames: [{ type, value: sanValue }],
    isSubjectSectionShown: true,
    isSanSectionShown: true
  }).sans;

describe("evaluateSubjectStep with a required common name SAN", () => {
  it("matches an IP address common name by address, not by spelling", () => {
    const sans = sanSection(CertSubjectAlternativeNameType.IP_ADDRESS, "::1", "0:0:0:0:0:0:0:1");

    expect(sans.isBlocking).toBe(false);
  });

  it("treats a trailing dot on the common name as the same DNS name", () => {
    const sans = sanSection(
      CertSubjectAlternativeNameType.DNS_NAME,
      "app.example.com.",
      "app.example.com"
    );

    expect(sans.isBlocking).toBe(false);
  });

  it("still blocks when the SAN is a different name", () => {
    const sans = sanSection(
      CertSubjectAlternativeNameType.DNS_NAME,
      "app.example.com",
      "other.example.com"
    );

    expect(sans.isBlocking).toBe(true);
  });
});
