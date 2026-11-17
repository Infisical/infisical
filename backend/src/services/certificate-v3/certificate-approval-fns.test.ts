import * as x509 from "@peculiar/x509";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { encodeCustomExtensionValue } from "../certificate-common/certificate-extension-fns";
import { EnrollmentType } from "../certificate-profile/certificate-profile-types";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import {
  certificateApprovalServiceFactory,
  TIssueCertificateFromApprovedRequestDeps
} from "./certificate-approval-fns";

vi.mock("../certificate-common/certificate-issuance-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../certificate-common/certificate-issuance-utils")>()),
  validateAlgorithmCompatibility: vi.fn(),
  validateCaSupport: vi.fn(),
  resolveEffectiveApiConfig: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../certificate-common/certificate-quota-fns", () => ({
  assertCertificateQuotaForProject: vi.fn().mockResolvedValue({
    quotaOrgId: null,
    isNewQuotaKey: false,
    isWildcard: false
  }),
  recordNewCertificateQuotaKey: vi.fn()
}));

vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()),
  assertCaInProfileProject: vi.fn()
}));

const SIGNING_STOPPED = new Error("signing stopped by test");
const TEMPLATE_INFO_OID = "1.3.6.1.4.1.311.21.7";
const SID_OID = "1.3.6.1.4.1.311.25.2";
const AD_NAME = "laptop01.corp.example.com";

const buildCsrPem = async (commonName?: string) => {
  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048
  };
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: commonName ? `CN=${commonName}` : undefined,
    keys,
    signingAlgorithm: algorithm
  });
  return csr.toString("pem");
};

describe("certificateApprovalService issuing an approved request", () => {
  let deps: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  const profile = {
    id: "profile-id",
    slug: "windows-computers",
    projectId: "project-id",
    caId: "ca-id",
    certificatePolicyId: "policy-id",
    enrollmentType: EnrollmentType.API,
    defaults: { customExtensions: [{ oid: TEMPLATE_INFO_OID, critical: false, value: "profile-copy" }] }
  };

  const storedRequest = (overrides: Record<string, unknown>) => ({
    id: "request-id",
    status: CertificateRequestStatus.PENDING,
    profileId: profile.id,
    ttl: "30d",
    commonName: null,
    altNames: null,
    customExtensions: null,
    keyUsages: null,
    extendedKeyUsages: null,
    basicConstraints: null,
    notBefore: null,
    notAfter: null,
    signatureAlgorithm: null,
    keyAlgorithm: null,
    applicationId: null,
    ...overrides
  });

  const signInput = () =>
    deps.internalCaService.signCertFromCa.mock.calls[0][0] as {
      subjectOverride?: string;
      altNames?: string;
      customExtensions: { oid: string; value: string }[];
    };

  beforeEach(() => {
    deps = {
      certificateRequestDAL: { findById: vi.fn(), updateById: vi.fn() },
      certificateProfileDAL: { findByIdWithConfigs: vi.fn().mockResolvedValue(profile) },
      certificateAuthorityDAL: {
        findByIdWithAssociatedCa: vi.fn().mockResolvedValue({ id: "ca-id", projectId: "project-id", externalCa: null })
      },
      certificatePolicyService: {
        getPolicyById: vi.fn().mockResolvedValue({ id: "policy-id", basicConstraints: null }),
        validateCertificateRequest: vi.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          resolvedCustomExtensions: [{ oid: TEMPLATE_INFO_OID, critical: false, value: "profile-copy" }]
        })
      },
      internalCaService: { signCertFromCa: vi.fn().mockRejectedValue(SIGNING_STOPPED), issueCertFromCa: vi.fn() }
    };
  });

  const issue = async (request: Record<string, unknown>) => {
    deps.certificateRequestDAL.findById.mockResolvedValue(request);
    const service = certificateApprovalServiceFactory(deps as unknown as TIssueCertificateFromApprovedRequestDeps);
    await expect(service.issueCertificate("request-id")).rejects.toThrow(SIGNING_STOPPED);
  };

  test("signs an approved Microsoft Autoenrollment request for the Active Directory name, not the request's", async () => {
    await issue(
      storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }]
      })
    );

    expect(signInput().subjectOverride).toBe(`CN=${AD_NAME}`);
    expect(signInput().altNames).toBe(AD_NAME);
  });

  test("signs each extension the issuer added once, even when the profile declares the same one", async () => {
    await issue(
      storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }],
        customExtensions: [
          { oid: TEMPLATE_INFO_OID, critical: false, value: "issuer-copy", issuerAdded: true },
          { oid: SID_OID, critical: false, value: "sid", issuerAdded: true }
        ]
      })
    );

    const extensions = signInput().customExtensions;
    expect(extensions.filter((extension) => extension.oid === TEMPLATE_INFO_OID)).toEqual([
      expect.objectContaining({ value: "issuer-copy" })
    ]);
    expect(extensions.filter((extension) => extension.oid === SID_OID)).toHaveLength(1);
  });

  test("tells policy validation which extensions the issuer adds, so a required SID rule can pass", async () => {
    await issue(
      storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }],
        customExtensions: [{ oid: SID_OID, critical: false, value: "sid", issuerAdded: true }]
      })
    );

    expect(deps.certificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
      "policy-id",
      expect.anything(),
      { issuerAddedOids: [SID_OID] }
    );
  });

  test("refuses an approved request whose computer SID the policy now denies", async () => {
    deps.certificatePolicyService.getPolicyById.mockResolvedValue({
      id: "policy-id",
      basicConstraints: null,
      customExtensions: [{ oid: SID_OID, denied: ["S-1-5-21-*"] }]
    });
    deps.certificateRequestDAL.findById.mockResolvedValue(
      storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }],
        customExtensions: [
          {
            oid: SID_OID,
            critical: false,
            value: encodeCustomExtensionValue(SID_OID, "S-1-5-21-1111111111-2222222222-3333333333-1105"),
            issuerAdded: true
          }
        ]
      })
    );
    const service = certificateApprovalServiceFactory(deps as unknown as TIssueCertificateFromApprovedRequestDeps);

    await expect(service.issueCertificate("request-id")).rejects.toThrow(/is denied by this policy/);
    expect(deps.internalCaService.signCertFromCa).not.toHaveBeenCalled();
  });

  test("keeps the request's own subject for an approved request from another enrollment method", async () => {
    await issue(
      storedRequest({
        enrollmentType: EnrollmentType.API,
        csr: await buildCsrPem("service.example.com"),
        commonName: AD_NAME
      })
    );

    expect(signInput().subjectOverride).toContain("CN=service.example.com");
    expect(signInput().altNames).toBeUndefined();
  });
});
