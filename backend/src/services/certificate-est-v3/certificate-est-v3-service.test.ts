/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-bitwise */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { EnrollmentType } from "../certificate-profile/certificate-profile-types";
import { certificateEstV3ServiceFactory, TCertificateEstV3ServiceFactory } from "./certificate-est-v3-service";

// Mock the x509 module
vi.mock("@peculiar/x509", () => ({
  Pkcs10CertificateRequest: vi.fn(),
  GeneralNames: vi.fn(),
  KeyUsagesExtension: vi.fn(),
  ExtendedKeyUsageExtension: vi.fn(),
  X509Certificate: vi.fn(),
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

// Mock other dependencies
vi.mock("@app/services/certificate-authority/certificate-authority-fns", () => ({
  parseDistinguishedName: vi.fn((subject: string) => {
    const parts = subject.split(",");
    const result: any = {};
    parts.forEach((part) => {
      const [key, value] = part.split("=");
      switch (key.trim()) {
        case "CN":
          result.commonName = value;
          break;
        case "O":
          result.organization = value;
          break;
        case "OU":
          result.ou = value;
          break;
        case "L":
          result.locality = value;
          break;
        case "ST":
          result.province = value;
          break;
        case "C":
          result.country = value;
          break;
        default:
          break;
      }
    });
    return result;
  })
}));

vi.mock("@app/services/certificate-authority/certificate-authority-validators", () => ({
  validateAndMapAltNameType: vi.fn((value: string) => {
    if (value.includes(".") && !value.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return { type: "dns", value };
    }
    if (value.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return { type: "ip", value };
    }
    return null;
  })
}));

vi.mock("@app/services/certificate-common/certificate-constants", () => ({
  mapLegacyKeyUsageToStandard: vi.fn((usage: string) => {
    const mapping: Record<string, string> = {
      digitalSignature: "digital_signature",
      keyEncipherment: "key_encipherment",
      keyCertSign: "key_cert_sign"
    };
    return mapping[usage] || usage;
  }),
  mapLegacyExtendedKeyUsageToStandard: vi.fn((usage: string) => {
    const mapping: Record<string, string> = {
      clientAuth: "client_auth",
      serverAuth: "server_auth",
      codeSigning: "code_signing"
    };
    return mapping[usage] || usage;
  }),
  CertKeyUsageType: {
    DIGITAL_SIGNATURE: "digital_signature",
    KEY_ENCIPHERMENT: "key_encipherment",
    KEY_CERT_SIGN: "key_cert_sign"
  },
  CertExtendedKeyUsageType: {
    CLIENT_AUTH: "client_auth",
    SERVER_AUTH: "server_auth",
    CODE_SIGNING: "code_signing"
  },
  CertSubjectAlternativeNameType: {
    DNS_NAME: "dns_name",
    IP_ADDRESS: "ip_address",
    RFC822_NAME: "rfc822_name",
    UNIFORM_RESOURCE_IDENTIFIER: "uniform_resource_identifier"
  }
}));

vi.mock("@app/services/certificate/certificate-types", () => ({
  mapLegacyAltNameType: vi.fn((type: string) => {
    const mapping: Record<string, string> = {
      dns: "dns_name",
      ip: "ip_address",
      email: "rfc822_name",
      url: "uniform_resource_identifier"
    };
    return mapping[type] || type;
  }),
  TAltNameType: {
    EMAIL: "email",
    DNS: "dns",
    IP: "ip",
    URL: "url"
  },
  CertExtendedKeyUsageOIDToName: {
    "1.3.6.1.5.5.7.3.1": "serverAuth",
    "1.3.6.1.5.5.7.3.2": "clientAuth",
    "1.3.6.1.5.5.7.3.3": "codeSigning"
  },
  CertKeyUsage: {
    DIGITAL_SIGNATURE: "digitalSignature",
    KEY_ENCIPHERMENT: "keyEncipherment",
    KEY_CERT_SIGN: "keyCertSign",
    NON_REPUDIATION: "nonRepudiation",
    DATA_ENCIPHERMENT: "dataEncipherment",
    KEY_AGREEMENT: "keyAgreement",
    CRL_SIGN: "cRLSign",
    ENCIPHER_ONLY: "encipherOnly",
    DECIPHER_ONLY: "decipherOnly"
  },
  CertExtendedKeyUsage: {
    CLIENT_AUTH: "clientAuth",
    SERVER_AUTH: "serverAuth",
    CODE_SIGNING: "codeSigning"
  }
}));

vi.mock("@app/services/certificate-common/certificate-utils", () => ({
  mapEnumsForValidation: vi.fn((req: any) => req)
}));

vi.mock("../../ee/services/certificate-est/certificate-est-fns", () => ({
  convertRawCertsToPkcs7: vi.fn(() => "mocked-pkcs7-response")
}));

describe("CertificateEstV3Service Security Fix", () => {
  let service: TCertificateEstV3ServiceFactory;

  const mockInternalCertificateAuthorityService = {
    signCertFromCa: vi.fn()
  };

  const mockCertificatePolicyService = {
    validateCertificateRequest: vi.fn()
  };

  const mockCertificatePolicyDAL = {
    findById: vi.fn().mockResolvedValue({
      id: "policy-123",
      basicConstraints: null,
      subject: [],
      sans: []
    })
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
    decryptWithKmsKey: vi.fn(),
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
    disableBootstrapCaValidation: true
  };

  const mockProject = {
    id: "project-123",
    orgId: "org-123"
  };

  const mockPlan = {
    pkiEst: true
  };

  beforeEach(async () => {
    const { Pkcs10CertificateRequest, GeneralNames } = await import("@peculiar/x509");

    service = certificateEstV3ServiceFactory({
      internalCertificateAuthorityService: mockInternalCertificateAuthorityService,
      certificatePolicyService: mockCertificatePolicyService,
      certificatePolicyDAL: mockCertificatePolicyDAL,
      certificateAuthorityDAL: mockCertificateAuthorityDAL,
      certificateAuthorityCertDAL: mockCertificateAuthorityCertDAL,
      projectDAL: mockProjectDAL,
      kmsService: mockKmsService,
      licenseService: mockLicenseService,
      certificateProfileDAL: mockCertificateProfileDAL,
      estEnrollmentConfigDAL: mockEstEnrollmentConfigDAL
    });

    mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(mockProfile);
    mockEstEnrollmentConfigDAL.findById.mockResolvedValue(mockEstConfig);
    mockProjectDAL.findOne.mockResolvedValue(mockProject);
    mockLicenseService.getPlan.mockResolvedValue(mockPlan);

    // Set up the default CSR parsing behavior
    (Pkcs10CertificateRequest as any).mockImplementation((csr: string) => {
      const parsed = JSON.parse(csr);
      const mockExtensions: any[] = [];

      if (parsed.sans && parsed.sans.length > 0) {
        mockExtensions.push({ type: "2.5.29.17", value: "mock-san-value" });
      }

      return {
        subject: parsed.subject,
        extensions: mockExtensions,
        getExtension: vi.fn((oid: string) => {
          if (oid === "2.5.29.15" && parsed.keyUsages && parsed.keyUsages.length > 0) {
            // Calculate usages as bitwise OR of key usage flags
            let usages = 0;
            parsed.keyUsages.forEach((usage: string) => {
              switch (usage) {
                case "digital_signature":
                  usages |= 1; // KeyUsageFlags.digitalSignature
                  break;
                case "key_encipherment":
                  usages |= 4; // KeyUsageFlags.keyEncipherment
                  break;
                case "key_cert_sign":
                  usages |= 32; // KeyUsageFlags.keyCertSign
                  break;
                default:
                  break;
              }
            });
            return { usages };
          }
          if (oid === "2.5.29.37" && parsed.extendedKeyUsages && parsed.extendedKeyUsages.length > 0) {
            const ekuOids = parsed.extendedKeyUsages.map((eku: string) => {
              switch (eku) {
                case "client_auth":
                  return "1.3.6.1.5.5.7.3.2";
                case "server_auth":
                  return "1.3.6.1.5.5.7.3.1";
                case "code_signing":
                  return "1.3.6.1.5.5.7.3.3";
                default:
                  return "1.3.6.1.5.5.7.3.1";
              }
            });
            return { usages: ekuOids };
          }
          return undefined;
        })
      };
    });

    (GeneralNames as any).mockImplementation(() => ({
      items: [
        { type: "dns", value: "test.example.com" },
        { type: "ip", value: "192.168.1.1" }
      ]
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockCSR = (
    options: {
      subject?: string;
      keyUsages?: string[];
      extendedKeyUsages?: string[];
      sans?: Array<{ type: string; value: string }>;
    } = {}
  ) => {
    const {
      subject = "CN=test.example.com,O=Test Org,C=US",
      keyUsages = [],
      extendedKeyUsages = [],
      sans = []
    } = options;

    return JSON.stringify({
      subject,
      keyUsages,
      extendedKeyUsages,
      sans
    });
  };

  describe("CSR Extraction and Template Validation", () => {
    it("should extract subject attributes from CSR", async () => {
      const csr = createMockCSR({
        subject: "CN=test.example.com,O=Test Organization,OU=IT Department,L=San Francisco,ST=California,C=US"
      });

      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr,
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.objectContaining({
          commonName: "test.example.com",
          organization: "Test Organization",
          organizationUnit: "IT Department",
          locality: "San Francisco",
          state: "California",
          country: "US"
        })
      );
    });

    it("should extract key usages from CSR", async () => {
      const csr = createMockCSR({
        keyUsages: ["digital_signature", "key_encipherment"]
      });

      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr,
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.objectContaining({
          keyUsages: expect.arrayContaining(["digital_signature", "key_encipherment"])
        })
      );
    });

    it("should extract extended key usages from CSR", async () => {
      const csr = createMockCSR({
        extendedKeyUsages: ["client_auth", "server_auth"]
      });

      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr,
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.objectContaining({
          extendedKeyUsages: expect.arrayContaining(["client_auth", "server_auth"])
        })
      );
    });

    it("should extract Subject Alternative Names from CSR", async () => {
      const { GeneralNames } = await import("@peculiar/x509");

      const csr = createMockCSR({
        sans: [
          { type: "dns", value: "test.example.com" },
          { type: "ip", value: "192.168.1.1" }
        ]
      });

      (GeneralNames as any).mockImplementation(() => ({
        items: [
          { type: "dns", value: "test.example.com" },
          { type: "ip", value: "192.168.1.1" }
        ]
      }));

      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr,
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.objectContaining({
          subjectAlternativeNames: expect.arrayContaining([
            expect.objectContaining({
              type: "dns_name",
              value: "test.example.com"
            }),
            expect.objectContaining({
              type: "ip_address",
              value: "192.168.1.1"
            })
          ])
        })
      );
    });
  });

  describe("Template Validation Enforcement", () => {
    const basicCSR = createMockCSR();

    it("should enforce template validation and reject invalid requests", async () => {
      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: false,
        errors: ["Common name 'test.example.com' is not allowed", "Key usage 'digital_signature' is denied"],
        warnings: []
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: basicCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);

      expect(mockInternalCertificateAuthorityService.signCertFromCa).not.toHaveBeenCalled();
    });

    it("should allow valid requests that pass template validation", async () => {
      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr: basicCSR,
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.any(Object)
      );
      expect(mockInternalCertificateAuthorityService.signCertFromCa).toHaveBeenCalledWith({
        isInternal: true,
        caId: "ca-123",
        csr: basicCSR,
        isFromProfile: true,
        basicConstraints: undefined
      });
    });

    it("should validate template for both simpleEnrollByProfile and simpleReenrollByProfile", async () => {
      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: false,
        errors: ["SAN value 'evil.com' is denied"],
        warnings: []
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: basicCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalled();
      expect(mockInternalCertificateAuthorityService.signCertFromCa).not.toHaveBeenCalled();
    });
  });

  describe("Policy Bypass Prevention", () => {
    const maliciousCSR = createMockCSR({
      subject: "CN=evil.com,O=Evil Corp,C=XX",
      keyUsages: ["key_cert_sign"],
      sans: [
        { type: "dns", value: "*.example.com" },
        { type: "ip", value: "127.0.0.1" }
      ]
    });

    it("should block attempts to bypass subject attribute policies", async () => {
      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: false,
        errors: ["Organization 'Evil Corp' is denied", "Country 'XX' is not allowed"],
        warnings: []
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: maliciousCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.objectContaining({
          commonName: "evil.com",
          organization: "Evil Corp",
          country: "XX"
        })
      );
    });

    it("should block attempts to bypass key usage policies", async () => {
      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: false,
        errors: ["Key usage 'key_cert_sign' is denied - certificate authority privileges not allowed"],
        warnings: []
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: maliciousCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);

      expect(mockCertificatePolicyService.validateCertificateRequest).toHaveBeenCalledWith(
        "policy-123",
        expect.objectContaining({
          keyUsages: expect.arrayContaining(["key_cert_sign"])
        })
      );
    });

    it("should block attempts to bypass SAN policies", async () => {
      const { GeneralNames } = await import("@peculiar/x509");

      (GeneralNames as any).mockImplementation(() => ({
        items: [
          { type: "dns", value: "*.example.com" },
          { type: "ip", value: "127.0.0.1" }
        ]
      }));

      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: false,
        errors: ["SAN value '*.example.com' matches denied wildcard pattern", "SAN value '127.0.0.1' is denied"],
        warnings: []
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: maliciousCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("Error Handling", () => {
    const basicCSR = createMockCSR();

    it("should handle profile not found", async () => {
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue(null);

      await expect(
        service.simpleEnrollByProfile({
          csr: basicCSR,
          profileId: "nonexistent",
          sslClientCert: ""
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should handle non-EST enrollment type", async () => {
      mockCertificateProfileDAL.findByIdWithConfigs.mockResolvedValue({
        ...mockProfile,
        enrollmentType: EnrollmentType.API
      });

      await expect(
        service.simpleEnrollByProfile({
          csr: basicCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should handle template validation service errors", async () => {
      mockCertificatePolicyService.validateCertificateRequest.mockRejectedValue(
        new Error("Template validation service unavailable")
      );

      await expect(
        service.simpleEnrollByProfile({
          csr: basicCSR,
          profileId: "profile-123",
          sslClientCert: ""
        })
      ).rejects.toThrow("Template validation service unavailable");
    });
  });

  describe("Integration with existing flow", () => {
    const basicCSR = createMockCSR();

    beforeEach(() => {
      mockCertificatePolicyService.validateCertificateRequest.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });
    });

    it("should call internal CA service with correct parameters after validation", async () => {
      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr: basicCSR,
        profileId: "profile-123",
        sslClientCert: ""
      });

      expect(mockInternalCertificateAuthorityService.signCertFromCa).toHaveBeenCalledWith({
        isInternal: true,
        caId: "ca-123",
        isFromProfile: true,
        csr: basicCSR,
        basicConstraints: undefined
      });
    });

    it("should use profile's CA ID instead of template ID to avoid v1/v2 mismatch", async () => {
      mockInternalCertificateAuthorityService.signCertFromCa.mockResolvedValue({
        certificate: { rawData: new ArrayBuffer(0) }
      });

      await service.simpleEnrollByProfile({
        csr: basicCSR,
        profileId: "profile-123",
        sslClientCert: ""
      });

      // Verify it uses caId from profile, not certificatePolicyId
      expect(mockInternalCertificateAuthorityService.signCertFromCa).toHaveBeenCalledWith(
        expect.objectContaining({
          caId: "ca-123"
        })
      );

      // Verify it does NOT pass certificatePolicyId to avoid v1/v2 confusion
      expect(mockInternalCertificateAuthorityService.signCertFromCa).toHaveBeenCalledWith(
        expect.not.objectContaining({
          certificatePolicyId: expect.anything()
        })
      );
    });
  });
});
