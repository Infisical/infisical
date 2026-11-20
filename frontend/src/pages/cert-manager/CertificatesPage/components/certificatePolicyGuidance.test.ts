import { describe, expect, it } from "vitest";

import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";
import {
  CertRequestReference,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import {
  buildPolicyRules,
  evaluateSubjectStep,
  withRequiredRows
} from "./certificatePolicyGuidance";

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

describe("evaluateSubjectStep with the profile's common name default SAN", () => {
  const dnsCommonNameDefault = [
    { type: CertSubjectAlternativeNameType.DNS_NAME, value: CertRequestReference.COMMON_NAME }
  ];
  const evaluate = (sans: TCertificatePolicy["sans"], subjectAltNames: { value: string }[]) =>
    evaluateSubjectStep({
      rules: buildPolicyRules({ sans } as unknown as TCertificatePolicy),
      subjectAttributes: [{ type: CertSubjectAttributeType.COMMON_NAME, value: "app.example.com" }],
      subjectAltNames: subjectAltNames.map(({ value }) => ({
        type: CertSubjectAlternativeNameType.DNS_NAME,
        value
      })),
      isSubjectSectionShown: true,
      isSanSectionShown: true,
      profileReferenceSans: dnsCommonNameDefault
    }).sans;

  it("counts the added SAN toward a required rule when the request lists no SANs", () => {
    const sans = evaluate(
      [
        {
          type: CertSubjectAlternativeNameType.DNS_NAME,
          required: [CertRequestReference.COMMON_NAME]
        }
      ],
      []
    );

    expect(sans.isBlocking).toBe(false);
  });

  it("adds nothing once the request lists its own SANs", () => {
    const sans = evaluate(
      [
        {
          type: CertSubjectAlternativeNameType.DNS_NAME,
          required: [CertRequestReference.COMMON_NAME]
        }
      ],
      [{ value: "other.example.com" }]
    );

    expect(sans.isBlocking).toBe(true);
  });

  it("blocks when the policy denies the SAN the profile would add", () => {
    const sans = evaluate(
      [{ type: CertSubjectAlternativeNameType.DNS_NAME, denied: ["*.example.com"] }],
      []
    );

    expect(sans.isBlocking).toBe(true);
    expect(sans.notices[0]?.message).toContain("The profile adds the common name as a SAN.");
  });
});

describe("withRequiredRows with the profile's common name default SAN", () => {
  const rules = buildPolicyRules({
    sans: [
      { type: CertSubjectAlternativeNameType.DNS_NAME, required: ["*"] },
      { type: CertSubjectAlternativeNameType.URI, required: ["spiffe://example.com/service"] }
    ]
  } as unknown as TCertificatePolicy);
  const profileReferenceSans = [
    { type: CertSubjectAlternativeNameType.DNS_NAME, value: CertRequestReference.COMMON_NAME }
  ];
  const dnsRows = (subjectAltNames: { type: CertSubjectAlternativeNameType; value: string }[]) =>
    withRequiredRows(
      rules,
      [],
      subjectAltNames,
      profileReferenceSans,
      subjectAltNames
    ).subjectAltNames.filter((san) => san.type === CertSubjectAlternativeNameType.DNS_NAME);

  it("seeds a DNS row once another required row means the profile will not add the common name", () => {
    expect(dnsRows([])).toEqual([{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "" }]);
  });

  it("seeds nothing when an existing DNS row already satisfies the requirement", () => {
    expect(
      dnsRows([{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "static.example.com" }])
    ).toEqual([{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "static.example.com" }]);
  });
});

describe("evaluateSubjectStep with the profile's static default SANs still in place", () => {
  it("still counts the common name SAN the profile adds", () => {
    const { sans } = evaluateSubjectStep({
      rules: buildPolicyRules({
        sans: [
          {
            type: CertSubjectAlternativeNameType.DNS_NAME,
            allowed: ["*"],
            required: [CertRequestReference.COMMON_NAME]
          }
        ]
      } as unknown as TCertificatePolicy),
      subjectAttributes: [{ type: CertSubjectAttributeType.COMMON_NAME, value: "app.example.com" }],
      subjectAltNames: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: "edge.example.com" }
      ],
      isSubjectSectionShown: true,
      isSanSectionShown: true,
      profileReferenceSans: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: CertRequestReference.COMMON_NAME }
      ],
      profileStaticSans: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: "edge.example.com" }
      ]
    });

    expect(sans.isBlocking).toBe(false);
  });
});

describe("evaluateSubjectStep when the common name equals a static default SAN", () => {
  it("does not flag a second copy the server would not add", () => {
    const { sans } = evaluateSubjectStep({
      rules: buildPolicyRules({
        sans: [{ type: CertSubjectAlternativeNameType.DNS_NAME, allowed: ["edge.example.com"] }]
      } as unknown as TCertificatePolicy),
      subjectAttributes: [
        { type: CertSubjectAttributeType.COMMON_NAME, value: "edge.example.com." }
      ],
      subjectAltNames: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: "edge.example.com" }
      ],
      isSubjectSectionShown: true,
      isSanSectionShown: true,
      profileReferenceSans: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: CertRequestReference.COMMON_NAME }
      ],
      profileStaticSans: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: "edge.example.com" }
      ]
    });

    expect(sans.isBlocking).toBe(false);
  });
});
