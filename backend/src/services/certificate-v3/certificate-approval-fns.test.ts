import * as x509 from "@peculiar/x509";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { encodeCustomExtensionValue, resolveCustomExtensions } from "../certificate-common/certificate-extension-fns";
import { TCertificateRequest, TPolicyValidationOptions } from "../certificate-policy/certificate-policy-types";
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

  test("signs the extensions policy validation returns, which carry the issuer's", async () => {
    const resolvedCustomExtensions = [
      { oid: TEMPLATE_INFO_OID, critical: false, value: "issuer-copy", issuerAdded: true },
      { oid: SID_OID, critical: false, value: "sid", issuerAdded: true }
    ];
    deps.certificatePolicyService.validateCertificateRequest.mockResolvedValue({
      isValid: true,
      errors: [],
      resolvedCustomExtensions
    });

    await issue(
      storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }],
        customExtensions: resolvedCustomExtensions
      })
    );

    expect(signInput().customExtensions).toEqual(resolvedCustomExtensions);
  });

  test("hands policy validation the extensions the issuer added, so it checks and returns them", async () => {
    const sidExtension = { oid: SID_OID, critical: false, value: "sid", issuerAdded: true };
    await issue(
      storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }],
        customExtensions: [sidExtension]
      })
    );

    expect(deps.certificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
      "policy-id",
      expect.anything(),
      { issuerAddedExtensions: [sidExtension] }
    );
  });

  test("refuses an approved request whose computer SID the policy now denies", async () => {
    deps.certificatePolicyService.validateCertificateRequest.mockImplementation(
      async (_policyId: string, request: TCertificateRequest, options?: TPolicyValidationOptions) => {
        const { errors, extensions } = resolveCustomExtensions({
          rules: [{ oid: SID_OID, denied: ["S-1-5-21-*"] }],
          requestExtensions: request.customExtensions,
          issuerAddedExtensions: options?.issuerAddedExtensions
        });
        return { isValid: !errors.length, errors, resolvedCustomExtensions: extensions };
      }
    );
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

  describe("persisting the issued certificate", () => {
    const issuanceTx = { isTransaction: true };

    const persistApproved = async (request: Record<string, unknown>) => {
      deps.certificateDAL = {
        updateById: vi.fn(),
        findById: vi.fn().mockResolvedValue({ id: "cert-old", orderId: null })
      };
      deps.resourceMetadataDAL = { find: vi.fn().mockResolvedValue([]), insertMany: vi.fn() };
      deps.certificateAlertEventEmitter = { emit: vi.fn() };
      deps.internalCaService.signCertFromCa.mockImplementation(
        async ({ onPersisted }: { onPersisted: (cert: unknown, tx: unknown) => Promise<void> }) => {
          await onPersisted({ id: "cert-new", notAfter: new Date(Date.now() + 86400000) }, issuanceTx);
          throw SIGNING_STOPPED;
        }
      );
      await issue(request);
    };

    test("links an approved Microsoft Autoenrollment renewal to the certificate it replaces", async () => {
      await persistApproved(
        storedRequest({
          enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
          csr: await buildCsrPem(),
          commonName: AD_NAME,
          altNames: [{ type: "dns_name", value: AD_NAME }],
          renewedFromCertificateId: "cert-old"
        })
      );

      expect(deps.certificateDAL.updateById).toHaveBeenCalledWith(
        "cert-new",
        expect.objectContaining({ renewedFromCertificateId: "cert-old" }),
        issuanceTx
      );
      expect(deps.certificateDAL.updateById).toHaveBeenCalledWith(
        "cert-old",
        { renewedByCertificateId: "cert-new" },
        issuanceTx
      );
    });

    test("leaves an approved request that is not a linked renewal unlinked", async () => {
      await persistApproved(
        storedRequest({
          enrollmentType: EnrollmentType.API,
          csr: await buildCsrPem("service.example.com"),
          renewedFromCertificateId: null
        })
      );

      expect(deps.certificateDAL.updateById).toHaveBeenCalledWith(
        "cert-new",
        expect.not.objectContaining({ renewedFromCertificateId: expect.any(String) as string }),
        issuanceTx
      );
      expect(deps.certificateDAL.updateById).not.toHaveBeenCalledWith("cert-old", expect.anything(), expect.anything());
    });
  });

  describe("signature algorithm checked against the policy", () => {
    const validatedSignatureAlgorithm = () =>
      (deps.certificatePolicyService.validateCertificateRequest.mock.calls[0][1] as TCertificateRequest)
        .signatureAlgorithm;

    test("checks the signature algorithm resolved for the CA when the request was submitted, as direct signing does", async () => {
      await issue(
        storedRequest({
          enrollmentType: EnrollmentType.API,
          csr: await buildCsrPem("service.example.com"),
          signatureAlgorithm: "ECDSA-SHA384"
        })
      );

      expect(validatedSignatureAlgorithm()).toBe("ECDSA-SHA384");
    });

    test("falls back to the request's own signature algorithm when none was stored", async () => {
      await issue(storedRequest({ enrollmentType: EnrollmentType.API, csr: await buildCsrPem("service.example.com") }));

      expect(validatedSignatureAlgorithm()).toBe("RSA-SHA256");
    });
  });

  describe("pre-sign check for the enrollment method", () => {
    const preSignCheck = vi.fn();

    const issueWithCheck = (request: Record<string, unknown>) => {
      deps.certificateRequestDAL.findById.mockResolvedValue(request);
      return certificateApprovalServiceFactory({
        ...deps,
        enrollmentPreSignHooks: { [EnrollmentType.MICROSOFT_AUTOENROLLMENT]: preSignCheck }
      } as unknown as TIssueCertificateFromApprovedRequestDeps).issueCertificate("request-id");
    };

    beforeEach(() => {
      preSignCheck.mockReset();
    });

    test("runs the check with the stored request before signing it", async () => {
      const request = storedRequest({
        enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
        csr: await buildCsrPem(),
        commonName: AD_NAME,
        altNames: [{ type: "dns_name", value: AD_NAME }]
      });

      await expect(issueWithCheck(request)).rejects.toThrow(SIGNING_STOPPED);

      expect(preSignCheck).toHaveBeenCalledWith(request);
      expect(preSignCheck.mock.invocationCallOrder[0]).toBeLessThan(
        deps.internalCaService.signCertFromCa.mock.invocationCallOrder[0]
      );
    });

    test("fails the request with the check's reason instead of signing it", async () => {
      preSignCheck.mockRejectedValue(
        new Error("Computer LAPTOP01$ was disabled in Active Directory after the request was submitted.")
      );

      await expect(
        issueWithCheck(
          storedRequest({
            enrollmentType: EnrollmentType.MICROSOFT_AUTOENROLLMENT,
            csr: await buildCsrPem(),
            commonName: AD_NAME,
            altNames: [{ type: "dns_name", value: AD_NAME }]
          })
        )
      ).rejects.toThrow("was disabled in Active Directory");

      expect(deps.internalCaService.signCertFromCa).not.toHaveBeenCalled();
      expect(deps.certificateRequestDAL.updateById).toHaveBeenCalledWith("request-id", {
        status: CertificateRequestStatus.FAILED,
        errorMessage: "Computer LAPTOP01$ was disabled in Active Directory after the request was submitted."
      });
    });

    test("does not run another method's check", async () => {
      await expect(
        issueWithCheck(
          storedRequest({ enrollmentType: EnrollmentType.API, csr: await buildCsrPem("service.example.com") })
        )
      ).rejects.toThrow(SIGNING_STOPPED);

      expect(preSignCheck).not.toHaveBeenCalled();
    });
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
