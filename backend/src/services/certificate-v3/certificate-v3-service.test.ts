/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ForbiddenError } from "@casl/ability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";

import { ActorType, AuthMethod } from "../auth/auth-type";
import { certificateV3ServiceFactory, TCertificateV3ServiceFactory } from "./certificate-v3-service";

describe("CertificateV3Service", () => {
  let service: TCertificateV3ServiceFactory;

  const mockCertificateDAL = {
    findOne: vi.fn(),
    updateById: vi.fn()
  } as any;

  const mockCertificateAuthorityDAL = {
    findByIdWithAssociatedCa: vi.fn()
  } as any;

  const mockCertificateProfileDAL = {
    findByIdWithConfigs: vi.fn()
  } as any;

  const mockCertificateTemplateV2Service = {
    validateCertificateRequest: vi.fn(),
    getTemplateV2ById: vi.fn()
  } as any;

  const mockInternalCaService = {
    signCertFromCa: vi.fn(),
    issueCertFromCa: vi.fn()
  } as any;

  const mockPermissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission: {
        throwUnlessCan: vi.fn()
      }
    })
  } as any;

  const mockActor = {
    actor: ActorType.USER,
    actorId: "user-123",
    actorAuthMethod: AuthMethod.EMAIL as any,
    actorOrgId: "org-123"
  };

  beforeEach(() => {
    vi.spyOn(ForbiddenError, "from").mockReturnValue({
      throwUnlessCan: vi.fn()
    } as any);

    service = certificateV3ServiceFactory({
      certificateDAL: mockCertificateDAL,
      certificateAuthorityDAL: mockCertificateAuthorityDAL,
      certificateProfileDAL: mockCertificateProfileDAL,
      certificateTemplateV2Service: mockCertificateTemplateV2Service,
      internalCaService: mockInternalCaService,
      permissionService: mockPermissionService
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("issueCertificateFromProfile", () => {
    const mockCertificateRequest = {
      commonName: "test.example.com",
      keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE],
      extendedKeyUsages: [CertExtendedKeyUsage.SERVER_AUTH],
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
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      const mockCA = {
        id: "ca-123",
        externalCa: null
      };

      const mockTemplate = {
        id: "template-123",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: []
      };

      const mockCertificateResult = {
        certificate: Buffer.from("cert"),
        certificateChain: Buffer.from("chain"),
        privateKey: Buffer.from("key"),
        serialNumber: "123456"
      };

      const mockCertRecord = {
        id: "cert-123",
        serialNumber: "123456"
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);
      mockCertificateTemplateV2Service.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      mockCertificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue(mockCA);
      mockCertificateTemplateV2Service.getTemplateV2ById.mockResolvedValue(mockTemplate);
      mockInternalCaService.issueCertFromCa.mockResolvedValue(mockCertificateResult);
      mockCertificateDAL.findOne.mockResolvedValue(mockCertRecord);
      mockCertificateDAL.updateById.mockResolvedValue({});

      const result = await service.issueCertificateFromProfile({
        profileId,
        certificateRequest: mockCertificateRequest,
        ...mockActor
      });

      expect(result).toHaveProperty("certificate");
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
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      const mockCA = {
        id: "ca-123",
        externalCa: null
      };

      const mockTemplate = {
        id: "template-123",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: []
      };

      const mockCertificateResult = {
        certificate: Buffer.from("cert"),
        certificateChain: Buffer.from("chain"),
        privateKey: Buffer.from("key"),
        serialNumber: "123456"
      };

      const mockCertRecord = {
        id: "cert-123",
        serialNumber: "123456"
      };

      const camelCaseRequest = {
        commonName: "test.example.com",
        keyUsages: [
          CertKeyUsage.DIGITAL_SIGNATURE,
          CertKeyUsage.NON_REPUDIATION,
          CertKeyUsage.KEY_AGREEMENT,
          CertKeyUsage.CRL_SIGN,
          CertKeyUsage.DECIPHER_ONLY
        ],
        extendedKeyUsages: [
          CertExtendedKeyUsage.CLIENT_AUTH,
          CertExtendedKeyUsage.CODE_SIGNING,
          CertExtendedKeyUsage.OCSP_SIGNING,
          CertExtendedKeyUsage.SERVER_AUTH
        ],
        validity: { ttl: "10d" }
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);
      mockCertificateTemplateV2Service.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      mockCertificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue(mockCA);
      mockCertificateTemplateV2Service.getTemplateV2ById.mockResolvedValue(mockTemplate);
      mockInternalCaService.issueCertFromCa.mockResolvedValue(mockCertificateResult);
      mockCertificateDAL.findOne.mockResolvedValue(mockCertRecord);
      mockCertificateDAL.updateById.mockResolvedValue({});

      await service.issueCertificateFromProfile({
        profileId,
        certificateRequest: camelCaseRequest,
        ...mockActor
      });

      // Verify that the template validation service was called with mapped snake_case values
      expect(mockCertificateTemplateV2Service.validateCertificateRequest).toHaveBeenCalledWith(
        "template-123",
        expect.objectContaining({
          keyUsages: ["digital_signature", "non_repudiation", "key_agreement", "crl_sign", "decipher_only"],
          extendedKeyUsages: ["client_auth", "code_signing", "ocsp_signing", "server_auth"]
        })
      );
    });

    it("should throw ForbiddenRequestError when profile is not configured for API enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.EST, // Wrong enrollment type
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);

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
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(null);

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
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      const mockCA = {
        id: "ca-123",
        externalCa: null
      };

      const mockSignResult = {
        certificate: Buffer.from("signed-cert"),
        certificateChain: Buffer.from("chain"),
        serialNumber: "789012"
      };

      const mockCertRecord = {
        id: "cert-456",
        serialNumber: "789012"
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);
      mockCertificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue(mockCA);
      mockInternalCaService.signCertFromCa.mockResolvedValue(mockSignResult);
      mockCertificateDAL.findOne.mockResolvedValue(mockCertRecord);
      mockCertificateDAL.updateById.mockResolvedValue({});

      const result = await service.signCertificateFromProfile({
        profileId,
        csr: mockCSR,
        validity: mockValidity,
        ...mockActor
      });

      expect(result).toHaveProperty("certificate");
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
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);

      await expect(
        service.signCertificateFromProfile({
          profileId,
          csr: mockCSR,
          validity: mockValidity,
          ...mockActor
        })
      ).rejects.toThrow(ForbiddenRequestError);

      await expect(
        service.signCertificateFromProfile({
          profileId,
          csr: mockCSR,
          validity: mockValidity,
          ...mockActor
        })
      ).rejects.toThrow("Profile is not configured for api enrollment");
    });
  });

  describe("orderCertificateFromProfile", () => {
    const mockCertificateOrder = {
      identifiers: [{ type: "dns" as const, value: "example.com" }],
      validity: { ttl: "30d" },
      commonName: "example.com",
      keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE],
      extendedKeyUsages: [CertExtendedKeyUsage.SERVER_AUTH],
      signatureAlgorithm: "RSA-SHA256",
      keyAlgorithm: "RSA_2048"
    };

    it("should create order successfully for API enrollment profile", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.API,
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      const mockCA = {
        id: "ca-123",
        externalCa: null
      };

      const mockTemplate = {
        id: "template-123",
        signatureAlgorithm: { defaultAlgorithm: "RSA-SHA256" },
        keyAlgorithm: { defaultKeyType: "RSA_2048" },
        attributes: []
      };

      const mockCertificateResult = {
        certificate: Buffer.from("cert"),
        certificateChain: Buffer.from("chain"),
        privateKey: Buffer.from("key"),
        serialNumber: "123456"
      };

      const mockCertRecord = {
        id: "cert-123",
        serialNumber: "123456"
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);
      mockCertificateTemplateV2Service.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
      mockCertificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue(mockCA);
      mockCertificateTemplateV2Service.getTemplateV2ById.mockResolvedValue(mockTemplate);
      mockInternalCaService.issueCertFromCa.mockResolvedValue(mockCertificateResult);
      mockCertificateDAL.findOne.mockResolvedValue(mockCertRecord);
      mockCertificateDAL.updateById.mockResolvedValue({});

      const result = await service.orderCertificateFromProfile({
        profileId,
        certificateOrder: mockCertificateOrder,
        ...mockActor
      });

      expect(result).toHaveProperty("orderId");
      expect(result).toHaveProperty("status", "valid");
      expect(result).toHaveProperty("certificate");
      expect(result.identifiers).toHaveLength(1);
      expect(result.identifiers[0]).toEqual({
        type: "dns",
        value: "example.com",
        status: "valid"
      });
    });

    it("should throw ForbiddenRequestError when profile is not configured for API enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        id: profileId,
        projectId: "project-123",
        enrollmentType: EnrollmentType.EST, // Wrong enrollment type
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);

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
});
