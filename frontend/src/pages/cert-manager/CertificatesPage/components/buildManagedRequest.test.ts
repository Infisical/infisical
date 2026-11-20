import { describe, expect, it } from "vitest";

import {
  CertRequestReference,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

import { buildManagedRequest } from "./buildManagedRequest";
import type { TemplateConstraints } from "./useCertificatePolicy";

const staticSan = { type: CertSubjectAlternativeNameType.DNS_NAME, value: "edge.example.com" };
const commonNameDefault = {
  type: CertSubjectAlternativeNameType.DNS_NAME,
  value: CertRequestReference.COMMON_NAME
};

const build = (
  subjectAltNames: { type: CertSubjectAlternativeNameType; value: string }[],
  withCommonNameDefault: boolean
) =>
  buildManagedRequest({
    formData: {
      requestMethod: "managed",
      profileId: "profile-1",
      ttl: "1d",
      subjectAttributes: [{ type: CertSubjectAttributeType.COMMON_NAME, value: "app.example.com" }],
      subjectAltNames,
      keyUsages: {},
      extendedKeyUsages: {},
      customExtensions: [],
      metadata: []
    } as unknown as Parameters<typeof buildManagedRequest>[0]["formData"],
    isAdcsProfile: false,
    constraints: {
      shouldShowSubjectSection: true,
      shouldShowSanSection: true
    } as TemplateConstraints,
    defaults: {
      subjectAltNames: withCommonNameDefault ? [staticSan, commonNameDefault] : [staticSan]
    }
  }).attributes.altNames;

describe("buildManagedRequest with profile default SANs", () => {
  it("leaves untouched static default rows to the profile when it also adds the common name", () => {
    expect(build([staticSan], true)).toEqual([]);
  });

  it("sends the rows when the requester changed them", () => {
    expect(build([{ ...staticSan, value: "other.example.com" }], true)).toEqual([
      { type: CertSubjectAlternativeNameType.DNS_NAME, value: "other.example.com" }
    ]);
  });

  it("keeps sending the static default rows for a profile without the common name default", () => {
    expect(build([staticSan], false)).toEqual([staticSan]);
  });
});

describe("buildManagedRequest with edited rows that repeat one default", () => {
  it("sends the rows when two rows match the same one of two static defaults", () => {
    const backupSan = {
      type: CertSubjectAlternativeNameType.DNS_NAME,
      value: "backup.example.com"
    };
    const request = buildManagedRequest({
      formData: {
        requestMethod: "managed",
        profileId: "profile-1",
        ttl: "1d",
        subjectAttributes: [
          { type: CertSubjectAttributeType.COMMON_NAME, value: "app.example.com" }
        ],
        subjectAltNames: [staticSan, staticSan],
        keyUsages: {},
        extendedKeyUsages: {},
        customExtensions: [],
        metadata: []
      } as unknown as Parameters<typeof buildManagedRequest>[0]["formData"],
      isAdcsProfile: false,
      constraints: {
        shouldShowSubjectSection: true,
        shouldShowSanSection: true
      } as TemplateConstraints,
      defaults: { subjectAltNames: [staticSan, backupSan, commonNameDefault] }
    });

    expect(request.attributes.altNames).toEqual([staticSan, staticSan]);
  });
});
