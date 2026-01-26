/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";

import { EnrollmentType } from "../certificate-profile/certificate-profile-types";
import { certificateEstV3ServiceFactory, TCertificateEstV3ServiceFactory } from "./certificate-est-v3-service";

// Mock the x509 module
vi.mock("@peculiar/x509", () => ({
  Pkcs10CertificateRequest: vi.fn(),
  GeneralNames: vi.fn(),
  KeyUsagesExtension: vi.fn(),
  ExtendedKeyUsageExtension: vi.fn(),
  X509Certificate: vi.fn().mockImplementation(() => ({
    rawData: new ArrayBuffer(0)
  })),
  KeyUsageFlags: {
    digitalSignature: 1,
    nonRepudiation: 2,
    keyEncipherment: 4,
    dataEncipherment: 8,
    keyAgreement: 16,
    keyCertSign: 32,
    cRLSign: 64,
    encipherOnly: 128,
    decipherOnly: 256
  }
}));

vi.mock("@app/lib/certificates/extract-certificate", () => ({
  extractX509CertFromChain: vi.fn(() => ["mock-cert"])
}));

vi.mock("@app/services/certificate/certificate-fns", () => ({
  isCertChainValid: vi.fn(() => Promise.resolve(true))
}));

vi.mock("@app/services/certificate-authority/certificate-authority-fns", () => ({
  getCaCertChain: vi.fn(() =>
    Promise.resolve({
      caCert: "mock-ca-cert",
      caCertChain: "mock-ca-chain"
    })
  ),
  getCaCertChains: vi.fn(() =>
    Promise.resolve([
      {
        certificate: "mock-cert",
        certificateChain: "mock-chain"
      }
    ])
  )
}));

vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn(() => Promise.resolve("mock-kms-id"))
}));

vi.mock("../../ee/services/certificate-est/certificate-est-fns", () => ({
  convertRawCertsToPkcs7: vi.fn(() => "mocked-pkcs7-response")
}));

describe("CertificateEstV3Service", () => {
  let service: TCertificateEstV3ServiceFactory;

  const mockCertificateV3Service = {
    signCertificateFromProfile: vi.fn()
  };

  const mockCertificateAuthorityDAL = {
    findById: vi.fn(),
    findByIdWithAssociatedCa: vi.fn()
  };

  const mockCertificateAuthorityCertDAL = {
    find: vi.fn(),
    findById: vi.fn()
  };

  const mockProjectDAL = {
    findOne: vi.fn(),
    updateById: vi.fn(),
    transaction: vi.fn()
  };

  const mockKmsService = {
    decryptWithKmsKey: vi.fn().mockResolvedValue(vi.fn(() => Promise.resolve(Buffer.from("mock-decrypted")))),
    generateKmsKey: vi.fn()
  };

  const mockLicenseService = {
    getPlan: vi.fn()
  };

  const mockCertificateProfileDAL = {
    findByIdWithConfigs: vi.fn()
  };

  const mockEstEnrollmentConfigDAL = {
    findById: vi.fn()
  };

  const mockCertificatePolicyDAL = {
    findById: vi.fn()
  };

  const mockProfile = {
    id: "profile-123",
    projectId: "project-123",
    caId: "ca-123",
    certificatePolicyId: "policy-123",
    slug: "test-profile",
    enrollmentType: EnrollmentType.EST,
    issuerType: "ca" as const,
    estConfigId: "est-config-123",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockEstConfig = {
    id: "est-config-123",
    disableBootstrapCaValidation: true,
    encryptedCaChain: null,
    hashedPassphrase: "hashed",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockProject = {
    id: "project-123",
    orgId: "org-123"
  };

  const mockPlan = {
    pkiEst: true
  };

  const mockPolicy = {
    id: "policy-123",
    validity: { max: "90d" }
  };

  beforeEach(async () => {
    service = certificateEstV3ServiceFactory({
      certificateV3Service: mockCertificateV3Service,
      certificateAuthorityDAL: mockCertificateAuthorityDAL,
      certificateAuthorityCertDAL: mockCertificateAuthorityCertDAL,
      projectDAL: mockProjectDAL,
      kmsService: mockKmsService,
      licenseService: mockLicenseService,
      certificateProfileDAL: mockCertificateProfileDAL,
      estEnrollmentConfigDAL: mockEstEnrollmentConfigDAL,
      certificatePolicyDAL: mockCertificatePolicyDAL
    });

    mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);
    mockEstEnrollmentConfigDAL.findById.mockResolvedValue(mockEstConfig);
    mockProjectDAL.findOne.mockResolvedValue(mockProject);
    mockLicenseService.getPlan.mockResolvedValue(mockPlan);
    mockCertificatePolicyDAL.findById.mockResolvedValue(mockPolicy);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("simpleEnrollByProfile", () => {
    it("should successfully enroll and return PKCS7 response", async () => {
      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.ISSUED,
        certificate: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
        certificateId: "cert-123"
      });

      const result = await service.simpleEnrollByProfile({
        csr: "mock-csr",
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(result).toBe("mocked-pkcs7-response");
      expect(mockCertificateV3Service.signCertificateFromProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "profile-123",
          csr: "mock-csr",
          enrollmentType: EnrollmentType.EST,
          validity: { ttl: "90d" }
        })
      );
    });

    it("should throw error when approval is required", async () => {
      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.PENDING_APPROVAL,
        certificateRequestId: "req-123",
        message: "Requires approval"
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(/requires approval/i);
    });

    it("should throw error when profile not found", async () => {
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(null);

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "nonexistent",
          sslClientCert: ""
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw error when profile is not configured for EST", async () => {
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue({
        ...mockProfile,
        enrollmentType: EnrollmentType.API
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw error when EST config not found", async () => {
      mockEstEnrollmentConfigDAL.findById.mockResolvedValue(null);

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw error when PKI EST is not available in plan", async () => {
      mockLicenseService.getPlan.mockResolvedValue({ pkiEst: false });

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw error when certificate is not returned", async () => {
      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.ISSUED,
        certificate: null,
        certificateId: "cert-123"
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should use policy max validity as TTL", async () => {
      mockCertificatePolicyDAL.findById.mockResolvedValue({
        id: "policy-123",
        validity: { max: "30d" }
      });

      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.ISSUED,
        certificate: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
        certificateId: "cert-123"
      });

      await service.simpleEnrollByProfile({
        csr: "mock-csr",
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificateV3Service.signCertificateFromProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          validity: { ttl: "30d" }
        })
      );
    });

    it("should use default 90d TTL when policy has no validity", async () => {
      mockCertificatePolicyDAL.findById.mockResolvedValue({
        id: "policy-123",
        validity: null
      });

      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.ISSUED,
        certificate: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
        certificateId: "cert-123"
      });

      await service.simpleEnrollByProfile({
        csr: "mock-csr",
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificateV3Service.signCertificateFromProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          validity: { ttl: "90d" }
        })
      );
    });
  });

  describe("simpleReenrollByProfile", () => {
    beforeEach(async () => {
      const { Pkcs10CertificateRequest, X509Certificate, GeneralNames } = await import("@peculiar/x509");

      (Pkcs10CertificateRequest as any).mockImplementation(() => ({
        subject: "CN=test.example.com",
        extensions: []
      }));

      (X509Certificate as any).mockImplementation(() => ({
        subject: "CN=test.example.com",
        extensions: [],
        rawData: new ArrayBuffer(0)
      }));

      (GeneralNames as any).mockImplementation(() => ({
        items: []
      }));
    });

    it("should successfully re-enroll and return PKCS7 response", async () => {
      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.ISSUED,
        certificate: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
        certificateId: "cert-123"
      });

      const result = await service.simpleReenrollByProfile({
        csr: "mock-csr",
        profileId: "profile-123",
        sslClientCert: encodeURIComponent("-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----")
      });

      expect(result).toBe("mocked-pkcs7-response");
    });

    it("should throw error when subjects do not match", async () => {
      const { Pkcs10CertificateRequest, X509Certificate } = await import("@peculiar/x509");

      (Pkcs10CertificateRequest as any).mockImplementation(() => ({
        subject: "CN=different.example.com",
        extensions: []
      }));

      (X509Certificate as any).mockImplementation(() => ({
        subject: "CN=test.example.com",
        extensions: [],
        rawData: new ArrayBuffer(0)
      }));

      await expect(
        service.simpleReenrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: encodeURIComponent("-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----")
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw error when approval is required for re-enrollment", async () => {
      mockCertificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.PENDING_APPROVAL,
        certificateRequestId: "req-123",
        message: "Requires approval"
      });

      await expect(
        service.simpleReenrollByProfile({
          csr: "mock-csr",
          profileId: "profile-123",
          sslClientCert: encodeURIComponent("-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----")
        })
      ).rejects.toThrow(/requires approval/i);
    });
  });

  describe("getCaCertsByProfile", () => {
    it("should return CA certificates in PKCS7 format", async () => {
      mockCertificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
        id: "ca-123",
        internalCa: {
          id: "internal-ca-123",
          activeCaCertId: "ca-cert-123"
        }
      });

      const result = await service.getCaCertsByProfile({
        profileId: "profile-123"
      });

      expect(result).toBe("mocked-pkcs7-response");
    });

    it("should throw error when profile not found", async () => {
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(null);

      await expect(
        service.getCaCertsByProfile({
          profileId: "nonexistent"
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw error when profile is not configured for EST", async () => {
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue({
        ...mockProfile,
        enrollmentType: EnrollmentType.API
      });

      await expect(
        service.getCaCertsByProfile({
          profileId: "profile-123"
        })
      ).rejects.toThrow(BadRequestError);
    });
  });
});
