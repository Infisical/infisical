/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError } from "@casl/ability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TPkiAcmeAccountDALFactory } from "@app/ee/services/pki-acme/pki-acme-account-dal";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { ACMESANType, CertificateOrderStatus, CertStatus } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import {
  CertExtendedKeyUsageType,
  CertIncludeType,
  CertKeyUsageType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { EnrollmentType, IssuerType } from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateTemplateV2ServiceFactory } from "@app/services/certificate-template-v2/certificate-template-v2-service";

import { ActorType, AuthMethod } from "../auth/auth-type";
import {
  extractAlgorithmsFromCSR,
  extractCertificateRequestFromCSR
} from "../certificate-common/certificate-csr-utils";
import { certificateV3ServiceFactory, TCertificateV3ServiceFactory } from "./certificate-v3-service";

vi.mock("../certificate-common/certificate-csr-utils", () => ({
  extractCertificateRequestFromCSR: vi.fn(),
  extractAlgorithmsFromCSR: vi.fn()
}));

describe("CertificateV3Service", () => {
  let service: TCertificateV3ServiceFactory;

  const mockCertificateDAL: Pick<
    TCertificateDALFactory,
    "findOne" | "findById" | "updateById" | "transaction" | "create"
  > = {
    findOne: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    create: vi.fn().mockResolvedValue({
      id: "new-cert-id",
      serialNumber: "123456789",
      friendlyName: "Test Certificate",
      commonName: "test.example.com",
      status: "ACTIVE"
    }),
    transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const mockTx = {};
      return callback(mockTx);
    })
  };

  const mockCertificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create"> = {
    findOne: vi.fn(),
    create: vi.fn()
  };

  const mockCertificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa"> = {
    findByIdWithAssociatedCa: vi.fn()
  };

  const mockCertificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs"> = {
    findByIdWithConfigs: vi.fn()
  };

  const mockCertificateTemplateV2Service: Pick<
    TCertificateTemplateV2ServiceFactory,
    "validateCertificateRequest" | "getTemplateV2ById"
  > = {
    validateCertificateRequest: vi.fn(),
    getTemplateV2ById: vi.fn()
  };

  const mockAcmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById"> = {
    findById: vi.fn()
  };

  const mockInternalCaService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa" | "issueCertFromCa"> =
    {
      signCertFromCa: vi.fn(),
      issueCertFromCa: vi.fn()
    };

  const mockPermissionService: Pick<TPermissionServiceFactory, "getProjectPermission"> = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission: {
        throwUnlessCan: vi.fn(),
        can: vi.fn().mockReturnValue(true),
        cannot: vi.fn().mockReturnValue(false),
        relevantRuleFor: vi.fn(),
        rules: []
      }
    })
  };

  const mockActor = {
    actor: ActorType.USER,
    actorId: "user-123",
    actorAuthMethod: AuthMethod.EMAIL,
    actorOrgId: "org-123"
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();

    // Mock ForbiddenError.from static method
    vi.spyOn(ForbiddenError, "from").mockReturnValue({
      throwUnlessCan: vi.fn()
    } as any);

    // Ensure the permission service mock is properly set up
    (mockPermissionService.getProjectPermission as any).mockResolvedValue({
      permission: {
        throwUnlessCan: vi.fn(),
        can: vi.fn().mockReturnValue(true),
        cannot: vi.fn().mockReturnValue(false),
        relevantRuleFor: vi.fn(),
        rules: [],
        detectSubjectType: vi.fn()
      }
    });

    vi.mocked(extractCertificateRequestFromCSR).mockReturnValue({
      commonName: "test.example.com",
      keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
      extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH]
    });

    vi.mocked(extractAlgorithmsFromCSR).mockReturnValue({
      keyAlgorithm: "RSA_2048" as any,
      signatureAlgorithm: "RSA-SHA256" as any
    });

    service = certificateV3ServiceFactory({
      certificateDAL: mockCertificateDAL,
      certificateSecretDAL: mockCertificateSecretDAL,
      certificateAuthorityDAL: mockCertificateAuthorityDAL,
      certificateProfileDAL: mockCertificateProfileDAL,
      certificateTemplateV2Service: mockCertificateTemplateV2Service,
      acmeAccountDAL: mockAcmeAccountDAL,
      internalCaService: mockInternalCaService,
      permissionService: mockPermissionService,
      certificateSyncDAL: {
        findPkiSyncIdsByCertificateId: vi.fn().mockResolvedValue([]),
        addCertificates: vi.fn().mockResolvedValue([]),
        findByPkiSyncAndCertificate: vi.fn().mockResolvedValue(null)
      },
      pkiSyncDAL: {
        find: vi.fn().mockResolvedValue([])
      },
      pkiSyncQueue: {
        queuePkiSyncSyncCertificatesById: vi.fn().mockResolvedValue(undefined)
      },
      certificateBodyDAL: {
        create: vi.fn().mockResolvedValue({ id: "body-123" })
      },
      kmsService: {
        generateKmsKey: vi.fn().mockResolvedValue("kms-key-123"),
        encryptWithKmsKey: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(Buffer.from("encrypted"))),
        decryptWithKmsKey: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(Buffer.from("decrypted")))
      },
      projectDAL: {
        findOne: vi.fn().mockResolvedValue({ id: "project-123" }),
        findById: vi.fn().mockResolvedValue({ id: "project-123" }),
        updateById: vi.fn().mockResolvedValue({ id: "project-123" }),
        transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
          const mockTx = {};
          return callback(mockTx);
        })
      } as any
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks(); // Ensure static method mocks are properly restored
  });

  describe("issueCertificateFromProfile", () => {
    const mockCertificateRequest = {
      commonName: "test.example.com",
      keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
      extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
      validity: { ttl: "30d" },
      signatureAlgorithm: "RSA-SHA256",
      keyAlgorithm: "RSA_2048"
    };

    it("should issue certificate successfully for API enrollment profile", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile",
        description: "Test profile"
      };

      const mockCA = {
        id: "ca-123",
        projectId: "project-123",
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-123",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "Test CA",
          dn: "CN=Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "RSA_2048",
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-123"
        },
        name: "Test CA",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true
      };

      const mockTemplate = {
        id: "template-123",
        name: "Test Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        description: "Test template",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ]
      };

      const mockCertificateResult = {
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "issuing-ca",
        privateKey: "key",
        serialNumber: "123456",
        ca: {
          id: "ca-123",
          projectId: "project-123",
          name: "Test CA",
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
          enableDirectIssuance: true,
          externalCa: undefined,
          internalCa: {
            id: "internal-ca-123",
            parentCaId: null,
            type: "ROOT",
            friendlyName: "Test CA",
            organization: "Test Org",
            ou: "Test OU",
            country: "US",
            province: "CA",
            locality: "SF",
            commonName: "Test CA",
            dn: "CN=Test CA",
            serialNumber: "123",
            maxPathLength: null,
            keyAlgorithm: "RSA_2048",
            notBefore: null,
            notAfter: null,
            activeCaCertId: "cert-123",
            caId: "ca-123"
          }
        }
      };

      const mockCertRecord = {
        id: "cert-123",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        commonName: "test.example.com",
        friendlyName: "Test Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-123",
        certificateTemplateId: "template-123",
        revokedAt: null,
        revokedBy: null
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue(mockCertificateResult as any);
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue(mockCertRecord);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockCertRecord);

      const result = await service.issueCertificateFromProfile({
        profileId,
        certificateRequest: mockCertificateRequest,
        ...mockActor
      });

      expect(result).toHaveProperty("certificate");
      expect(result).toHaveProperty("issuingCaCertificate");
      expect(result).toHaveProperty("certificateChain");
      expect(result).toHaveProperty("privateKey");
      expect(result).toHaveProperty("serialNumber", "123456");
      expect(result).toHaveProperty("certificateId", "cert-123");
    });

    it("should correctly map camelCase key usages to snake_case before validation", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile-camel",
        description: "Test camelCase profile",
        estConfigId: null,
        apiConfigId: null
      };

      const mockCA = {
        id: "ca-123",
        projectId: "project-123",
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-123",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "Test CA",
          dn: "CN=Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "RSA_2048",
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-123"
        },
        name: "Test CA",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true
      };

      const mockTemplate = {
        id: "template-123",
        name: "Test Template for CamelCase",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        description: "Test template for camelCase validation",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      const mockCertRecord = {
        id: "cert-123",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        commonName: "test.example.com",
        friendlyName: "Test Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-123",
        certificateTemplateId: "template-123",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      };

      const camelCaseRequest = {
        commonName: "test.example.com",
        keyUsages: [
          CertKeyUsageType.DIGITAL_SIGNATURE,
          CertKeyUsageType.NON_REPUDIATION,
          CertKeyUsageType.KEY_AGREEMENT,
          CertKeyUsageType.CRL_SIGN,
          CertKeyUsageType.DECIPHER_ONLY
        ],
        extendedKeyUsages: [
          CertExtendedKeyUsageType.CLIENT_AUTH,
          CertExtendedKeyUsageType.CODE_SIGNING,
          CertExtendedKeyUsageType.OCSP_SIGNING,
          CertExtendedKeyUsageType.SERVER_AUTH
        ],
        validity: { ttl: "10d" }
      };

      const mockCertificateResultWithCa = {
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "issuing-ca",
        privateKey: "key",
        serialNumber: "123456",
        ca: {
          id: "ca-123",
          projectId: "project-123",
          name: "Test CA",
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
          enableDirectIssuance: true,
          externalCa: undefined,
          internalCa: {
            id: "internal-ca-123",
            parentCaId: null,
            type: "ROOT",
            friendlyName: "Test CA",
            organization: "Test Org",
            ou: "Test OU",
            country: "US",
            province: "CA",
            locality: "SF",
            commonName: "Test CA",
            dn: "CN=Test CA",
            serialNumber: "123",
            maxPathLength: null,
            keyAlgorithm: "RSA_2048",
            notBefore: null,
            notAfter: null,
            activeCaCertId: "cert-123",
            caId: "ca-123"
          }
        }
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue(mockCertificateResultWithCa as any);
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue(mockCertRecord);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockCertRecord);

      await service.issueCertificateFromProfile({
        profileId,
        certificateRequest: camelCaseRequest,
        ...mockActor
      });

      // Verify that the template validation service was called with mapped snake_case values
      expect(mockCertificateTemplateV2Service.validateCertificateRequest).toHaveBeenCalledWith(
        "template-123",
        expect.objectContaining({
          keyUsages: [
            CertKeyUsageType.DIGITAL_SIGNATURE,
            CertKeyUsageType.NON_REPUDIATION,
            CertKeyUsageType.KEY_AGREEMENT,
            CertKeyUsageType.CRL_SIGN,
            CertKeyUsageType.DECIPHER_ONLY
          ],
          extendedKeyUsages: [
            CertExtendedKeyUsageType.CLIENT_AUTH,
            CertExtendedKeyUsageType.CODE_SIGNING,
            CertExtendedKeyUsageType.OCSP_SIGNING,
            CertExtendedKeyUsageType.SERVER_AUTH
          ]
        })
      );
    });

    it("should throw ForbiddenRequestError when profile is not configured for API enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.EST, // Wrong enrollment type
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile-est",
        description: "Test EST profile",
        estConfigId: null,
        apiConfigId: null
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);

      await expect(
        service.issueCertificateFromProfile({
          profileId,
          certificateRequest: mockCertificateRequest,
          ...mockActor
        })
      ).rejects.toThrow(ForbiddenRequestError);

      await expect(
        service.issueCertificateFromProfile({
          profileId,
          certificateRequest: mockCertificateRequest,
          ...mockActor
        })
      ).rejects.toThrow("Profile is not configured for api enrollment");
    });

    it("should throw NotFoundError when profile doesn't exist", async () => {
      const profileId = "non-existent-profile";
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(undefined);

      await expect(
        service.issueCertificateFromProfile({
          profileId,
          certificateRequest: mockCertificateRequest,
          ...mockActor
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("signCertificateFromProfile", () => {
    const mockCSR = "-----BEGIN CERTIFICATE REQUEST-----\nMIIC...";
    const mockValidity = { ttl: "30d" };

    it("should sign certificate successfully for API enrollment profile", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile-sign",
        description: "Test signing profile",
        estConfigId: null,
        apiConfigId: null
      };

      const mockCA = {
        id: "ca-123",
        projectId: "project-123",
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-123",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "Test CA",
          dn: "CN=Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "RSA_2048",
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-123"
        },
        name: "Test CA",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true
      };

      const mockSignResult = {
        certificate: "signed-cert",
        certificateChain: "chain",
        issuingCaCertificate: "issuing-ca",
        serialNumber: "789012",
        commonName: "test.example.com",
        ca: {
          id: "ca-123",
          projectId: "project-123",
          name: "Test CA",
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
          enableDirectIssuance: true,
          externalCa: undefined,
          internalCa: {
            id: "internal-ca-123",
            parentCaId: null,
            type: "ROOT",
            friendlyName: "Test CA",
            organization: "Test Org",
            ou: "Test OU",
            country: "US",
            province: "CA",
            locality: "SF",
            commonName: "Test CA",
            dn: "CN=Test CA",
            serialNumber: "123",
            maxPathLength: null,
            keyAlgorithm: "RSA_2048",
            notBefore: null,
            notAfter: null,
            activeCaCertId: "cert-123",
            caId: "ca-123"
          }
        }
      };

      const mockCertRecord = {
        id: "cert-456",
        serialNumber: "789012",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        commonName: "test.example.com",
        friendlyName: "Test Signing Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-123",
        certificateTemplateId: "template-123",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      };

      const mockTemplate = {
        id: "template-123",
        name: "Test Signing Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        description: "Test template for signing certificates",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockInternalCaService.signCertFromCa).mockResolvedValue(mockSignResult as any);
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue(mockCertRecord);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockCertRecord);

      const result = await service.signCertificateFromProfile({
        profileId,
        csr: mockCSR,
        validity: mockValidity,
        enrollmentType: EnrollmentType.API,
        ...mockActor
      });

      expect(result).toHaveProperty("certificate");
      expect(result).toHaveProperty("issuingCaCertificate");
      expect(result).toHaveProperty("certificateChain");
      expect(result).toHaveProperty("serialNumber", "789012");
      expect(result).toHaveProperty("certificateId", "cert-456");
      expect(result).not.toHaveProperty("privateKey");
    });

    it("should throw ForbiddenRequestError when profile is not configured for API enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.EST, // Wrong enrollment type
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile-est-sign",
        description: "Test EST signing profile",
        estConfigId: null,
        apiConfigId: null
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);

      await expect(
        service.signCertificateFromProfile({
          profileId,
          csr: mockCSR,
          validity: mockValidity,
          enrollmentType: EnrollmentType.API,
          ...mockActor
        })
      ).rejects.toThrow(ForbiddenRequestError);

      await expect(
        service.signCertificateFromProfile({
          profileId,
          csr: mockCSR,
          validity: mockValidity,
          enrollmentType: EnrollmentType.API,
          ...mockActor
        })
      ).rejects.toThrow("Profile is not configured for api enrollment");
    });
  });

  describe("orderCertificateFromProfile", () => {
    const mockCertificateOrder = {
      altNames: [{ type: ACMESANType.DNS, value: "example.com" }],
      validity: { ttl: "30d" },
      commonName: "example.com",
      keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
      extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
      signatureAlgorithm: "RSA-SHA256",
      keyAlgorithm: "RSA_2048"
    };

    it("should create order successfully for API enrollment profile", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile-order",
        description: "Test order profile",
        estConfigId: null,
        apiConfigId: null
      };

      const mockCA = {
        id: "ca-123",
        projectId: "project-123",
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-123",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "Test CA",
          dn: "CN=Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "RSA_2048",
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-123"
        },
        name: "Test CA",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true
      };

      const mockTemplate = {
        id: "template-123",
        name: "Test Order Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        description: "Test template for ordering certificates",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      const mockCertificateResult = {
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "issuing-ca",
        privateKey: "key",
        serialNumber: "123456",
        ca: {
          id: "ca-123",
          projectId: "project-123",
          name: "Test CA",
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
          enableDirectIssuance: true,
          externalCa: undefined,
          internalCa: {
            id: "internal-ca-123",
            parentCaId: null,
            type: "ROOT",
            friendlyName: "Test CA",
            organization: "Test Org",
            ou: "Test OU",
            country: "US",
            province: "CA",
            locality: "SF",
            commonName: "Test CA",
            dn: "CN=Test CA",
            serialNumber: "123",
            maxPathLength: null,
            keyAlgorithm: "RSA_2048",
            notBefore: null,
            notAfter: null,
            activeCaCertId: "cert-123",
            caId: "ca-123"
          }
        }
      };

      const mockCertRecord = {
        id: "cert-123",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-123",
        commonName: "example.com",
        friendlyName: "Test Order Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-123",
        certificateTemplateId: "template-123",
        revokedAt: null,
        altNames: JSON.stringify([{ type: "DNS", value: "example.com" }]),
        caCertId: null,
        keyUsages: ["DIGITAL_SIGNATURE"],
        extendedKeyUsages: ["SERVER_AUTH"],
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue(mockCertificateResult as any);
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue(mockCertRecord);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockCertRecord);

      const result = await service.orderCertificateFromProfile({
        profileId,
        certificateOrder: mockCertificateOrder,
        ...mockActor
      });

      expect(result).toHaveProperty("orderId");
      expect(result).toHaveProperty("status", "valid");
      expect(result).toHaveProperty("certificate");
      expect(result.subjectAlternativeNames).toHaveLength(1);
      expect(result.subjectAlternativeNames[0]).toEqual({
        type: ACMESANType.DNS,
        value: "example.com",
        status: CertificateOrderStatus.VALID
      });
    });

    it("should throw ForbiddenRequestError when profile is not configured for API enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.EST, // Wrong enrollment type
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        slug: "test-profile-est-order",
        description: "Test EST order profile",
        estConfigId: null,
        apiConfigId: null
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);

      await expect(
        service.orderCertificateFromProfile({
          profileId,
          certificateOrder: mockCertificateOrder,
          ...mockActor
        })
      ).rejects.toThrow(ForbiddenRequestError);

      await expect(
        service.orderCertificateFromProfile({
          profileId,
          certificateOrder: mockCertificateOrder,
          ...mockActor
        })
      ).rejects.toThrow("Profile is not configured for api enrollment");
    });
  });

  describe("algorithm compatibility (integration tests)", () => {
    const mockProfile = {
      id: "profile-1",
      slug: "test-profile",
      projectId: "project-1",
      caId: "ca-1",
      certificateTemplateId: "template-1",
      enrollmentType: EnrollmentType.API,
      issuerType: IssuerType.CA,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: "Test profile for algorithm compatibility",
      estConfigId: null,
      apiConfigId: null
    };

    const mockCertificateRequest = {
      commonName: "test.example.com",
      validity: { ttl: "30d" },
      keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
      extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH]
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should successfully process RSA algorithms with RSA CAs", async () => {
      const rsaCa = {
        id: "ca-1",
        projectId: "project-1",
        status: "active",
        name: "RSA Test CA",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true,
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-1",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "RSA Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "RSA Test CA",
          dn: "CN=RSA Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "RSA_2048",
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-1"
        }
      };

      const rsaTemplate = {
        id: "template-1",
        name: "RSA Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        description: "RSA template for algorithm compatibility",
        signatureAlgorithm: {
          allowedAlgorithms: ["SHA256-RSA", "SHA384-RSA"]
        },
        keyAlgorithm: null,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(rsaCa);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(rsaTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue({
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "ca-cert",
        privateKey: "key",
        serialNumber: "123456",
        ca: rsaCa as any
      });
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });

      // Should not throw - RSA CA is compatible with RSA signature algorithms
      await expect(
        service.issueCertificateFromProfile({
          profileId: mockProfile.id,
          certificateRequest: {
            ...mockCertificateRequest,
            signatureAlgorithm: "RSA-SHA256"
          },
          ...mockActor
        })
      ).resolves.toBeDefined();
    });

    it("should successfully process ECDSA algorithms with EC CAs", async () => {
      const ecCa = {
        id: "ca-1",
        projectId: "project-1",
        status: "active",
        name: "EC Test CA",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true,
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-1",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "EC Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "EC Test CA",
          dn: "CN=EC Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "EC_prime256v1",
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-1"
        }
      };

      const ecdsaTemplate = {
        id: "template-1",
        name: "ECDSA Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        description: "ECDSA template for algorithm compatibility",
        signatureAlgorithm: {
          allowedAlgorithms: ["SHA256-ECDSA", "SHA384-ECDSA"]
        },
        keyAlgorithm: null,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(ecCa);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(ecdsaTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue({
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "ca-cert",
        privateKey: "key",
        serialNumber: "123456",
        ca: ecCa as any
      });
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });

      // Should not throw - EC CA is compatible with ECDSA signature algorithms
      await expect(
        service.issueCertificateFromProfile({
          profileId: mockProfile.id,
          certificateRequest: {
            ...mockCertificateRequest,
            signatureAlgorithm: "ECDSA-SHA256"
          },
          ...mockActor
        })
      ).resolves.toBeDefined();
    });

    it("should dynamically support new RSA key sizes", async () => {
      const rsa8192Ca = {
        id: "ca-1",
        projectId: "project-1",
        status: "active",
        name: "RSA 8192 Test CA",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true,
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-1",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "RSA 8192 Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "RSA 8192 Test CA",
          dn: "CN=RSA 8192 Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "RSA_8192", // Future RSA key size
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-1"
        }
      };

      const rsaTemplate = {
        id: "template-1",
        name: "RSA 8192 Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        description: "RSA 8192 template for future key sizes",
        signatureAlgorithm: {
          allowedAlgorithms: ["SHA256-RSA"]
        },
        keyAlgorithm: null,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(rsa8192Ca);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(rsaTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue({
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "ca-cert",
        privateKey: "key",
        serialNumber: "123456",
        ca: rsa8192Ca as any
      });
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });

      // Should not throw - dynamic check supports new RSA key sizes
      await expect(
        service.issueCertificateFromProfile({
          profileId: mockProfile.id,
          certificateRequest: {
            ...mockCertificateRequest,
            signatureAlgorithm: "RSA-SHA256"
          },
          ...mockActor
        })
      ).resolves.toBeDefined();
    });

    it("should dynamically support new EC curve types", async () => {
      const newEcCa = {
        id: "ca-1",
        projectId: "project-1",
        status: "active",
        name: "EC secp521r1 Test CA",
        createdAt: new Date(),
        updatedAt: new Date(),
        enableDirectIssuance: true,
        externalCa: undefined,
        internalCa: {
          id: "internal-ca-1",
          parentCaId: null,
          type: "ROOT",
          friendlyName: "EC secp521r1 Test CA",
          organization: "Test Org",
          ou: "Test OU",
          country: "US",
          province: "CA",
          locality: "SF",
          commonName: "EC secp521r1 Test CA",
          dn: "CN=EC secp521r1 Test CA",
          serialNumber: "123",
          maxPathLength: null,
          keyAlgorithm: "EC_secp521r1", // Future EC curve
          notBefore: undefined,
          notAfter: undefined,
          activeCaCertId: "cert-123",
          caId: "ca-1"
        }
      };

      const ecdsaTemplate = {
        id: "template-1",
        name: "ECDSA secp521r1 Template",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        description: "ECDSA secp521r1 template for future EC curves",
        signatureAlgorithm: {
          allowedAlgorithms: ["SHA384-ECDSA"]
        },
        keyAlgorithm: null,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            include: CertIncludeType.OPTIONAL,
            value: ["example.com"]
          }
        ],
        subject: undefined,
        sans: undefined,
        keyUsages: undefined,
        extendedKeyUsages: undefined,
        algorithms: undefined,
        validity: undefined
      };

      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(newEcCa);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(ecdsaTemplate);
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue({
        certificate: "cert",
        certificateChain: "chain",
        issuingCaCertificate: "ca-cert",
        privateKey: "key",
        serialNumber: "123456",
        ca: newEcCa as any
      });
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue({
        id: "cert-1",
        serialNumber: "123456",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId: "project-1",
        commonName: "test.example.com",
        friendlyName: "Test Algorithm Cert",
        notBefore: new Date(),
        notAfter: new Date(),
        caId: "ca-1",
        certificateTemplateId: "template-1",
        revokedAt: null,
        altNames: null,
        caCertId: null,
        keyUsages: null,
        extendedKeyUsages: null,
        revocationReason: null,
        pkiSubscriberId: null,
        profileId: null
      });

      // Should not throw - dynamic check supports new EC curves
      await expect(
        service.issueCertificateFromProfile({
          profileId: mockProfile.id,
          certificateRequest: {
            ...mockCertificateRequest,
            signatureAlgorithm: "ECDSA-SHA384"
          },
          ...mockActor
        })
      ).resolves.toBeDefined();
    });
  });

  describe("renewCertificate", () => {
    const mockOriginalCert = {
      id: "cert-123",
      status: CertStatus.ACTIVE,
      serialNumber: "123456",
      friendlyName: "Test Certificate",
      commonName: "test.example.com",
      notBefore: new Date("2024-01-01"),
      notAfter: new Date("2024-02-01"), // 31 days
      revokedAt: null,
      renewedByCertificateId: null,
      profileId: "profile-123",
      renewBeforeDays: 7,
      caId: "ca-123",
      pkiSubscriberId: null,
      keyUsages: ["digital_signature", "key_agreement"],
      extendedKeyUsages: ["server_auth"],
      altNames: "test.example.com,api.example.com",
      projectId: "project-123",
      createdAt: new Date(),
      updatedAt: new Date(),
      certificateTemplateId: "template-123",
      revocationReason: null,
      caCertId: null,
      renewedFromCertificateId: null,
      renewalError: null,
      keyAlgorithm: "RSA_2048",
      signatureAlgorithm: "RSA-SHA256"
    };

    const mockProfile = {
      id: "profile-123",
      projectId: "project-123",
      enrollmentType: EnrollmentType.API,
      issuerType: IssuerType.CA,
      caId: "ca-123",
      certificateTemplateId: "template-123",
      apiConfig: {
        id: "api-config-123",
        autoRenew: true,
        renewBeforeDays: 14
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      slug: "test-profile",
      description: "Test profile"
    };

    const mockCA = {
      id: "ca-123",
      projectId: "project-123",
      status: CaStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      enableDirectIssuance: true,
      name: "Test CA",
      requireTemplateForIssuance: false,
      externalCa: undefined,
      parentCaId: null,
      type: "ROOT",
      friendlyName: "Test CA",
      organization: "Test Org",
      ou: "Test OU",
      country: "US",
      province: "CA",
      locality: "SF",
      commonName: "Test CA",
      keyAlgorithm: "RSA_2048",
      notAfter: "2025-01-01T00:00:00Z",
      notBefore: "2024-01-01T00:00:00Z",
      maxPathLength: -1,
      activeCaCertId: "cert-123",
      dn: "CN=Test CA,O=Test Org,OU=Test OU,C=US",
      serialNumber: "123456789",
      internalCa: {
        id: "internal-ca-123",
        parentCaId: null,
        type: "ROOT",
        friendlyName: "Test CA",
        organization: "Test Org",
        ou: "Test OU",
        country: "US",
        province: "CA",
        locality: "SF",
        commonName: "Test CA",
        keyAlgorithm: "RSA_2048",
        notAfter: "2025-01-01T00:00:00Z",
        notBefore: "2024-01-01T00:00:00Z",
        maxPathLength: -1,
        activeCaCertId: "cert-123",
        dn: "CN=Test CA,O=Test Org,OU=Test OU,C=US",
        serialNumber: "123456789"
      }
    };

    const mockTemplate = {
      id: "template-123",
      projectId: "project-123",
      name: "Test Template",
      createdAt: new Date(),
      updatedAt: new Date(),
      algorithms: {
        signature: ["SHA256-RSA", "SHA384-RSA"],
        keyType: ["RSA_2048", "RSA_4096"]
      }
    };

    beforeEach(() => {
      // Mock current date to be within renewal window
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-26")); // 6 days before cert expires, within renewal window
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should successfully renew eligible certificate", async () => {
      // Mock the initial findById call
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockOriginalCert);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue({
        certificate: "renewed-cert",
        certificateChain: "renewed-chain",
        issuingCaCertificate: "issuing-ca",
        privateKey: "private-key",
        serialNumber: "789012",
        ca: mockCA
      });

      const newCert = { ...mockOriginalCert, id: "cert-456", serialNumber: "789012" };
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue(newCert);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(newCert);

      // Mock the transaction to return the expected structure
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        const result = await callback(mockTx);
        return result;
      });

      const result = await service.renewCertificate({
        certificateId: "cert-123",
        ...mockActor
      });

      expect(result).toHaveProperty("certificate", "renewed-cert");
      expect(result).toHaveProperty("certificateId", "cert-456");
      expect(mockCertificateDAL.updateById).toHaveBeenCalledWith(
        "cert-456",
        {
          profileId: "profile-123",
          renewBeforeDays: 14,
          renewedFromCertificateId: "cert-123"
        },
        {}
      );
      expect(mockCertificateDAL.updateById).toHaveBeenCalledWith(
        "cert-123",
        {
          renewedByCertificateId: "cert-456",
          renewalError: null
        },
        {}
      );
    });

    it("should validate certificate against current template during renewal", async () => {
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockOriginalCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: false,
        errors: ["Subject alternative name not allowed"],
        warnings: []
      });
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      // Mock updateById to handle the renewal error logging
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockOriginalCert);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("Certificate renewal failed. Errors: Subject alternative name not allowed");

      // Should store template validation error
      expect(mockCertificateDAL.updateById).toHaveBeenCalledWith("cert-123", {
        renewalError: "Template validation failed: Subject alternative name not allowed"
      });
    });

    it("should reject renewal if certificate has no profile and no CA", async () => {
      const certWithoutProfileAndCA = { ...mockOriginalCert, profileId: null, caId: null };
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(certWithoutProfileAndCA);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(ForbiddenRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("Only certificates issued from a profile can be renewed");
    });

    it("should reject renewal if certificate was issued from CSR (external private key)", async () => {
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockOriginalCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue(null as any);

      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(ForbiddenRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("certificates issued from CSR (external private key) cannot be renewed");
    });

    it("should reject renewal if certificate is already renewed", async () => {
      const alreadyRenewedCert = { ...mockOriginalCert, renewedByCertificateId: "cert-456" };
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(alreadyRenewedCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      // Mock updateById to handle the renewal error logging
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(alreadyRenewedCert);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("Certificate has already been renewed");
    });

    it("should reject renewal if certificate is expired", async () => {
      const expiredCert = {
        ...mockOriginalCert,
        notAfter: new Date("2024-01-20") // Expired 6 days ago
      };
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(expiredCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      // Mock updateById to handle the renewal error logging
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(expiredCert);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("Certificate is already expired");
    });

    it("should reject renewal if certificate is revoked", async () => {
      const revokedCert = {
        ...mockOriginalCert,
        revokedAt: new Date("2024-01-15")
      };
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(revokedCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      // Mock updateById to handle the renewal error logging
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(revokedCert);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("Certificate is revoked and cannot be renewed");
    });

    it("should reject renewal if CA is inactive", async () => {
      const inactiveCA = { ...mockCA, status: CaStatus.DISABLED };
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockOriginalCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(inactiveCA);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      // Mock updateById to handle the renewal error logging
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockOriginalCert);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow("Certificate is not eligible for renewal: Certificate Authority is disabled, must be active");
    });

    it("should reject renewal if new certificate would outlive CA", async () => {
      const shortLivedCA = {
        ...mockCA,
        internalCa: {
          ...mockCA.internalCa,
          notAfter: "2024-01-28T00:00:00Z"
        }
      };
      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockOriginalCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(shortLivedCA);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      // Mock updateById to handle the renewal error logging
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockOriginalCert);

      // Set up transaction mock to properly handle errors
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.renewCertificate({
          certificateId: "cert-123",
          ...mockActor
        })
      ).rejects.toThrow(/New certificate would expire \(.+\) after its issuing CA \(.+\)/);
    });

    it("should allow manual renewal outside window (manual renewal always bypasses window)", async () => {
      vi.setSystemTime(new Date("2024-01-15")); // 17 days before expiry, outside 7-day window

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockOriginalCert);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile);
      vi.mocked(mockCertificateAuthorityDAL.findByIdWithAssociatedCa).mockResolvedValue(mockCA);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);
      vi.mocked(mockCertificateTemplateV2Service.getTemplateV2ById).mockResolvedValue(mockTemplate);
      vi.mocked(mockCertificateTemplateV2Service.validateCertificateRequest).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      vi.mocked(mockInternalCaService.issueCertFromCa).mockResolvedValue({
        certificate: "renewed-cert",
        certificateChain: "renewed-chain",
        issuingCaCertificate: "issuing-ca",
        privateKey: "private-key",
        serialNumber: "789012",
        ca: mockCA
      });

      const newCert = { ...mockOriginalCert, id: "cert-456", serialNumber: "789012" };
      vi.mocked(mockCertificateDAL.findOne).mockResolvedValue(newCert);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(newCert);

      // Set up transaction mock to properly handle the renewal process
      vi.mocked(mockCertificateDAL.transaction).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
        const mockTx = {};
        return callback(mockTx);
      });

      const result = await service.renewCertificate({
        certificateId: "cert-123",
        ...mockActor
      });

      expect(result).toHaveProperty("certificate", "renewed-cert");
    });
  });

  describe("updateRenewalConfig", () => {
    it("should update renewal configuration successfully", async () => {
      const mockCert = {
        id: "cert-123",
        profileId: "profile-123",
        renewedByCertificateId: null,
        notBefore: new Date("2026-01-01"),
        notAfter: new Date("2026-02-01"),
        projectId: "project-123",
        status: CertStatus.ACTIVE,
        revokedAt: null,
        commonName: ""
      };

      const mockProfile = {
        id: "profile-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        projectId: "project-123"
      };

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockCert as any);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile as any);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockCert as any);

      const result = await service.updateRenewalConfig({
        actor: ActorType.USER,
        actorId: "user-123",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "org-123",
        certificateId: "cert-123",
        renewBeforeDays: 7
      });

      expect(result).toEqual({
        projectId: "project-123",
        renewBeforeDays: 7,
        commonName: ""
      });

      expect(mockCertificateDAL.updateById).toHaveBeenCalledWith("cert-123", {
        renewBeforeDays: 7
      });
    });

    it("should reject update if certificate is not from profile", async () => {
      const mockCert = {
        id: "cert-123",
        profileId: null,
        renewedByCertificateId: null,
        projectId: "project-123"
      };

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockCert as any);

      await expect(
        service.updateRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123",
          renewBeforeDays: 7
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.updateRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123",
          renewBeforeDays: 7
        })
      ).rejects.toThrow("Certificate is not eligible for auto-renewal: certificate was not issued from a profile");
    });

    it("should reject update if certificate is already renewed", async () => {
      const mockCert = {
        id: "cert-123",
        profileId: "profile-123",
        renewedByCertificateId: "cert-456",
        projectId: "project-123",
        status: CertStatus.ACTIVE,
        revokedAt: null,
        notBefore: new Date("2026-01-01"),
        notAfter: new Date("2026-02-01")
      };

      const mockProfile = {
        id: "profile-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        projectId: "project-123"
      };

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockCert as any);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile as any);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      await expect(
        service.updateRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123",
          renewBeforeDays: 7
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.updateRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123",
          renewBeforeDays: 7
        })
      ).rejects.toThrow("Certificate is not eligible for auto-renewal: certificate has already been renewed");
    });

    it("should reject update if renewBeforeDays >= certificate TTL", async () => {
      const mockCert = {
        id: "cert-123",
        profileId: "profile-123",
        renewedByCertificateId: null,
        notBefore: new Date("2026-01-01"),
        notAfter: new Date("2026-01-08"),
        projectId: "project-123",
        status: CertStatus.ACTIVE,
        revokedAt: null
      };

      const mockProfile = {
        id: "profile-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        projectId: "project-123"
      };

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockCert as any);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile as any);
      vi.mocked(mockCertificateSecretDAL.findOne).mockResolvedValue({ id: "secret-123", certId: "cert-123" } as any);

      await expect(
        service.updateRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123",
          renewBeforeDays: 8 // Greater than 7-day TTL
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.updateRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123",
          renewBeforeDays: 8
        })
      ).rejects.toThrow("Invalid renewal configuration: renewal threshold exceeds certificate validity period");
    });
  });

  describe("disableRenewalConfig", () => {
    it("should disable renewal configuration successfully", async () => {
      const mockCert = {
        id: "cert-123",
        profileId: "profile-123",
        projectId: "project-123",
        commonName: ""
      };

      const mockProfile = {
        id: "profile-123",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        projectId: "project-123"
      };

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockCert as any);
      vi.mocked(mockCertificateProfileDAL.findByIdWithConfigs).mockResolvedValue(mockProfile as any);
      vi.mocked(mockCertificateDAL.updateById).mockResolvedValue(mockCert as any);

      const result = await service.disableRenewalConfig({
        actor: ActorType.USER,
        actorId: "user-123",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "org-123",
        certificateId: "cert-123"
      });

      expect(result).toEqual({
        projectId: "project-123",
        commonName: ""
      });

      expect(mockCertificateDAL.updateById).toHaveBeenCalledWith("cert-123", {
        renewBeforeDays: null
      });
    });

    it("should reject disable if certificate is not from profile", async () => {
      const mockCert = {
        id: "cert-123",
        profileId: null,
        projectId: "project-123"
      };

      vi.mocked(mockCertificateDAL.findById).mockResolvedValue(mockCert as any);

      await expect(
        service.disableRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123"
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.disableRenewalConfig({
          actor: ActorType.USER,
          actorId: "user-123",
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: "org-123",
          certificateId: "cert-123"
        })
      ).rejects.toThrow("Certificate is not eligible for auto-renewal: certificate was not issued from a profile");
    });
  });
});
