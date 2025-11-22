/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ForbiddenError } from "@casl/ability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import type { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { ActorType, AuthMethod } from "../auth/auth-type";
import type { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import type { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import type { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import type { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import type { TCertificateTemplateV2DALFactory } from "../certificate-template-v2/certificate-template-v2-dal";
import { TAcmeEnrollmentConfigDALFactory } from "../enrollment-config/acme-enrollment-config-dal";
import type { TApiEnrollmentConfigDALFactory } from "../enrollment-config/api-enrollment-config-dal";
import type { TEstEnrollmentConfigDALFactory } from "../enrollment-config/est-enrollment-config-dal";
import type { TKmsServiceFactory } from "../kms/kms-service";
import type { TProjectDALFactory } from "../project/project-dal";
import type { TCertificateProfileDALFactory } from "./certificate-profile-dal";
import { certificateProfileServiceFactory, TCertificateProfileServiceFactory } from "./certificate-profile-service";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfile,
  TCertificateProfileWithConfigs
} from "./certificate-profile-types";

vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: {
    hashing: () => ({
      createHash: vi.fn().mockResolvedValue("mocked-hash")
    }),
    generateRandomPassword: vi.fn().mockReturnValue("mocked-password")
  }
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    SALT_ROUNDS: 12
  })
}));

describe("CertificateProfileService", () => {
  let service: TCertificateProfileServiceFactory;

  const mockCertificateProfileDAL = {
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    findBySlugAndProjectId: vi.fn(),
    findByProjectId: vi.fn(),
    countByProjectId: vi.fn(),
    findByNameAndProjectId: vi.fn(),
    findByIdWithConfigs: vi.fn(),
    getCertificatesByProfile: vi.fn(),
    isProfileInUse: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TCertificateProfileDALFactory;

  const mockCertificateTemplateV2DAL = {
    findById: vi.fn(),
    create: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    findByProjectId: vi.fn(),
    countByProjectId: vi.fn(),
    isTemplateInUse: vi.fn(),
    findByNameAndProjectId: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TCertificateTemplateV2DALFactory;

  const mockActor = {
    actor: ActorType.USER,
    actorId: "user-123",
    actorAuthMethod: AuthMethod.EMAIL,
    actorOrgId: "org-123"
  };

  const sampleProfile: TCertificateProfile = {
    id: "profile-123",
    projectId: "project-123",
    description: "Test certificate profile",
    slug: "test-profile",
    enrollmentType: EnrollmentType.API,
    issuerType: IssuerType.CA,
    caId: "ca-123",
    certificateTemplateId: "template-123",
    apiConfigId: "api-config-123",
    estConfigId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleProfileWithConfigs: TCertificateProfileWithConfigs = {
    ...sampleProfile,
    certificateAuthority: {
      id: "ca-123",
      projectId: "project-123",
      status: "active",
      name: "Test CA"
    },
    certificateTemplate: {
      id: "template-123",
      projectId: "project-123",
      name: "Test Template",
      description: "Test template"
    },
    apiConfig: {
      id: "api-config-123",
      autoRenew: true,
      renewBeforeDays: 30
    }
  };

  const sampleTemplate = {
    id: "template-123",
    projectId: "project-123",
    name: "Test Template"
  };

  const mockApiEnrollmentConfigDAL = {
    create: vi.fn().mockResolvedValue({ id: "api-config-123" }),
    findById: vi.fn(),
    updateById: vi.fn(),
    findProfilesForAutoRenewal: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TApiEnrollmentConfigDALFactory;

  const mockEstEnrollmentConfigDAL = {
    create: vi.fn().mockResolvedValue({ id: "est-config-123" }),
    findById: vi.fn(),
    updateById: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TEstEnrollmentConfigDALFactory;

  const mockAcmeEnrollmentConfigDAL = {
    create: vi.fn().mockResolvedValue({ id: "acme-config-123" }),
    findById: vi.fn(),
    updateById: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TAcmeEnrollmentConfigDALFactory;

  const mockPermissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission: {
        throwUnlessCan: vi.fn()
      }
    })
  } as unknown as Pick<TPermissionServiceFactory, "getProjectPermission">;

  const mockLicenseService = {
    getPlan: vi.fn()
  } as unknown as Pick<TLicenseServiceFactory, "getPlan">;

  const mockKmsService = {
    encryptWithKmsKey: vi
      .fn()
      .mockResolvedValue(() => Promise.resolve({ cipherTextBlob: Buffer.from("encrypted-data") })),
    decryptWithKmsKey: vi.fn().mockResolvedValue(() => Promise.resolve(Buffer.from("decrypted-ca-chain"))),
    generateKmsKey: vi.fn()
  } as unknown as Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;

  const mockProjectDAL = {
    findById: vi.fn(),
    findOne: vi.fn(),
    updateById: vi.fn(),
    findProjectBySlug: vi.fn(),
    transaction: vi.fn()
  } as unknown as Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;

  const mockCertificateBodyDAL = {
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TCertificateBodyDALFactory;

  const mockCertificateSecretDAL = {
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TCertificateSecretDALFactory;

  const mockCertificateAuthorityDAL = {
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TCertificateAuthorityDALFactory;

  const mockCertificateAuthorityCertDAL = {
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  } as unknown as TCertificateAuthorityCertDALFactory;

  beforeEach(() => {
    vi.spyOn(ForbiddenError, "from").mockReturnValue({
      throwUnlessCan: vi.fn()
    } as any);

    // Mock the transaction method to execute the callback and return the result
    (mockCertificateProfileDAL.transaction as any).mockImplementation(async (fn: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/return-await
      return await fn();
    });

    service = certificateProfileServiceFactory({
      certificateProfileDAL: mockCertificateProfileDAL,
      certificateTemplateV2DAL: mockCertificateTemplateV2DAL,
      apiEnrollmentConfigDAL: mockApiEnrollmentConfigDAL,
      estEnrollmentConfigDAL: mockEstEnrollmentConfigDAL,
      acmeEnrollmentConfigDAL: mockAcmeEnrollmentConfigDAL,
      certificateBodyDAL: mockCertificateBodyDAL,
      certificateSecretDAL: mockCertificateSecretDAL,
      certificateAuthorityDAL: mockCertificateAuthorityDAL,
      certificateAuthorityCertDAL: mockCertificateAuthorityCertDAL,
      permissionService: mockPermissionService,
      licenseService: mockLicenseService,
      kmsService: mockKmsService,
      projectDAL: mockProjectDAL
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createProfile", () => {
    const validProfileData = {
      slug: "new-profile",
      description: "New test profile",
      enrollmentType: EnrollmentType.API,
      issuerType: IssuerType.CA,
      caId: "ca-123",
      certificateTemplateId: "template-123",
      apiConfig: {
        autoRenew: true,
        renewBeforeDays: 30
      }
    };

    beforeEach(() => {
      (mockProjectDAL.findById as any).mockResolvedValue({
        id: "project-123",
        orgId: "org-123"
      });
      (mockLicenseService.getPlan as any).mockResolvedValue({
        pkiAcme: true
      });
      (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);
      (mockCertificateProfileDAL.findByNameAndProjectId as any).mockResolvedValue(null);
      (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(null);
      (mockCertificateProfileDAL.create as any).mockResolvedValue({
        ...sampleProfile,
        enrollmentType: EnrollmentType.API // Ensure enrollmentType is explicitly included
      });
    });

    it("should create profile successfully", async () => {
      const result = await service.createProfile({
        ...mockActor,
        projectId: "project-123",
        data: validProfileData
      });

      expect(result).toEqual(sampleProfile);
      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
      expect(mockCertificateProfileDAL.findBySlugAndProjectId).toHaveBeenCalledWith("new-profile", "project-123");
      expect(mockCertificateProfileDAL.create).toHaveBeenCalledWith(
        {
          slug: "new-profile",
          description: "New test profile",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfigId: "api-config-123",
          estConfigId: null,
          acmeConfigId: null,
          projectId: "project-123"
        },
        undefined
      );
    });

    it("should throw NotFoundError when certificate template not found", async () => {
      (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(null);

      await expect(
        service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: validProfileData
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenRequestError when template belongs to different project", async () => {
      (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue({
        ...sampleTemplate,
        projectId: "different-project"
      });

      await expect(
        service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: validProfileData
        })
      ).rejects.toThrow(ForbiddenRequestError);
    });

    it("should throw ForbiddenRequestError when profile slug already exists", async () => {
      (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(sampleProfile);

      await expect(
        service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: validProfileData
        })
      ).rejects.toThrow(ForbiddenRequestError);
    });

    it("should throw ForbiddenRequestError for EST enrollment without EST config", async () => {
      const invalidData = {
        ...validProfileData,
        enrollmentType: EnrollmentType.EST,
        estConfigId: null
      };

      await expect(
        service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: invalidData
        })
      ).rejects.toThrow(ForbiddenRequestError);
    });

    it("should throw ForbiddenRequestError for API enrollment without API config", async () => {
      const invalidData = {
        slug: "invalid-profile",
        description: "Invalid test profile",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123"
      };

      await expect(
        service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: invalidData
        })
      ).rejects.toThrow(ForbiddenRequestError);
    });

    it("should create profile with API enrollment", async () => {
      const apiProfileData = {
        slug: "api-profile",
        description: "Profile with API enrollment",
        enrollmentType: EnrollmentType.API,
        issuerType: IssuerType.CA,
        caId: "ca-123",
        certificateTemplateId: "template-123",
        apiConfig: {
          autoRenew: true,
          renewBeforeDays: 30
        }
      };

      const result = await service.createProfile({
        ...mockActor,
        projectId: "project-123",
        data: apiProfileData
      });

      expect(result).toEqual(sampleProfile);
      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
    });

    it("should throw BadRequestError when plan does not support ACME", async () => {
      (mockLicenseService.getPlan as any).mockResolvedValue({
        pkiAcme: false
      });

      await expect(
        service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: {
            ...validProfileData,
            enrollmentType: EnrollmentType.ACME,
            acmeConfig: {},
            apiConfig: undefined,
            estConfig: undefined
          }
        })
      ).rejects.toThrowError(
        new BadRequestError({
          message: "Failed to create certificate profile: Plan restriction. Upgrade plan to continue"
        })
      );
    });
  });

  describe("updateProfile", () => {
    const updateData = {
      slug: "updated-profile",
      description: "Updated description"
    };

    beforeEach(() => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
      (mockCertificateProfileDAL.updateById as any).mockResolvedValue({
        ...sampleProfile,
        ...updateData,
        enrollmentType: EnrollmentType.API // Ensure enrollmentType is explicitly included
      });
    });

    it("should update profile successfully", async () => {
      const result = await service.updateProfile({
        ...mockActor,
        profileId: "profile-123",
        data: updateData
      });

      expect(result.slug).toBe("updated-profile");
      expect(mockCertificateProfileDAL.findById).toHaveBeenCalledWith("profile-123");
      expect(mockCertificateProfileDAL.updateById).toHaveBeenCalledWith("profile-123", updateData, undefined);
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.updateProfile({
          ...mockActor,
          profileId: "profile-123",
          data: updateData
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should validate certificate template when updating", async () => {
      (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);

      const updateWithTemplate = {
        ...updateData,
        certificateTemplateId: "template-123"
      };

      await service.updateProfile({
        ...mockActor,
        profileId: "profile-123",
        data: updateWithTemplate
      });

      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
    });
  });

  describe("getProfileById", () => {
    it("should return profile successfully", async () => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);

      const result = await service.getProfileById({
        ...mockActor,
        profileId: "profile-123"
      });

      expect(result).toEqual(sampleProfile);
      expect(mockCertificateProfileDAL.findById).toHaveBeenCalledWith("profile-123");
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.getProfileById({
          ...mockActor,
          profileId: "profile-123"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getProfileByIdWithConfigs", () => {
    it("should return profile with configs successfully", async () => {
      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(sampleProfileWithConfigs);

      const result = await service.getProfileByIdWithConfigs({
        ...mockActor,
        profileId: "profile-123"
      });

      expect(result).toEqual(sampleProfileWithConfigs);
      expect(mockCertificateProfileDAL.findByIdWithConfigs).toHaveBeenCalledWith("profile-123");
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(null);

      await expect(
        service.getProfileByIdWithConfigs({
          ...mockActor,
          profileId: "profile-123"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getProfileBySlug", () => {
    it("should return profile by slug successfully", async () => {
      (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(sampleProfile);

      const result = await service.getProfileBySlug({
        ...mockActor,
        projectId: "project-123",
        slug: "test-profile"
      });

      expect(result).toEqual(sampleProfile);
      expect(mockCertificateProfileDAL.findBySlugAndProjectId).toHaveBeenCalledWith("test-profile", "project-123");
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(null);

      await expect(
        service.getProfileBySlug({
          ...mockActor,
          projectId: "project-123",
          slug: "nonexistent"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("listProfiles", () => {
    const mockProfiles = [sampleProfile];

    beforeEach(() => {
      (mockCertificateProfileDAL.findByProjectId as any).mockResolvedValue(mockProfiles);
      (mockCertificateProfileDAL.countByProjectId as any).mockResolvedValue(1);
    });

    it("should list profiles successfully", async () => {
      const result = await service.listProfiles({
        ...mockActor,
        projectId: "project-123"
      });

      expect(result.profiles).toEqual(mockProfiles);
      expect(result.totalCount).toBe(1);
      expect(mockCertificateProfileDAL.findByProjectId).toHaveBeenCalledWith("project-123", {
        offset: 0,
        limit: 20,
        search: undefined,
        enrollmentType: undefined,
        caId: undefined
      });
    });

    it("should list profiles with filters", async () => {
      await service.listProfiles({
        ...mockActor,
        projectId: "project-123",
        offset: 10,
        limit: 5,
        search: "test",
        enrollmentType: EnrollmentType.API,
        caId: "ca-123"
      });

      expect(mockCertificateProfileDAL.findByProjectId).toHaveBeenCalledWith("project-123", {
        offset: 10,
        limit: 5,
        search: "test",
        enrollmentType: EnrollmentType.API,
        caId: "ca-123"
      });
    });
  });

  describe("deleteProfile", () => {
    beforeEach(() => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
      (mockCertificateProfileDAL.isProfileInUse as any).mockResolvedValue(false);
      (mockCertificateProfileDAL.deleteById as any).mockResolvedValue(sampleProfile);
    });

    it("should delete profile successfully", async () => {
      const result = await service.deleteProfile({
        ...mockActor,
        profileId: "profile-123"
      });

      expect(result).toEqual(sampleProfile);
      expect(mockCertificateProfileDAL.findById).toHaveBeenCalledWith("profile-123");
      expect(mockCertificateProfileDAL.deleteById).toHaveBeenCalledWith("profile-123");
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.deleteProfile({
          ...mockActor,
          profileId: "profile-123"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getProfileCertificates", () => {
    const mockCertificates = [
      {
        id: "cert-123",
        serialNumber: "123456",
        cn: "example.com",
        status: "active",
        notBefore: new Date(),
        notAfter: new Date(),
        isRevoked: false,
        createdAt: new Date()
      }
    ];

    beforeEach(() => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
      (mockCertificateProfileDAL.getCertificatesByProfile as any).mockResolvedValue(mockCertificates);
    });

    it("should get profile certificates successfully", async () => {
      const result = await service.getProfileCertificates({
        ...mockActor,
        profileId: "profile-123"
      });

      expect(result).toEqual(mockCertificates);
      expect(mockCertificateProfileDAL.findById).toHaveBeenCalledWith("profile-123");
      expect(mockCertificateProfileDAL.getCertificatesByProfile).toHaveBeenCalledWith("profile-123", {
        offset: 0,
        limit: 20,
        status: undefined,
        search: undefined
      });
    });

    it("should get profile certificates with filters", async () => {
      await service.getProfileCertificates({
        ...mockActor,
        profileId: "profile-123",
        offset: 10,
        limit: 5,
        status: "active",
        search: "example"
      });

      expect(mockCertificateProfileDAL.getCertificatesByProfile).toHaveBeenCalledWith("profile-123", {
        offset: 10,
        limit: 5,
        status: "active",
        search: "example"
      });
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.getProfileCertificates({
          ...mockActor,
          profileId: "profile-123"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("comprehensive certificate profile scenarios", () => {
    describe("profile configuration validation", () => {
      it("should validate EST enrollment configuration", async () => {
        const estProfileData = {
          slug: "est-profile",
          description: "Profile with EST enrollment",
          enrollmentType: EnrollmentType.EST,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-123",
          estConfig: {
            disableBootstrapCaValidation: false,
            passphrase: "secret-passphrase",
            caChain:
              "-----BEGIN CERTIFICATE-----\nMIIC+DCCAeCgAwIBAgIUBmCvLQ7l6CmNYjGeGXqIaS9LPuUwDQYJKoZIhvcNAQEL\nBQAwFDESMBAGA1UEChMJSW5maXNpY2FsMB4XDTI1MTAxNzE1MjczMFoXDTM1MTAx\nNzAwMDAwMFowFDESMBAGA1UEChMJSW5maXNpY2FsMIIBIjANBgkqhkiG9w0BAQEF\nAAOCAQ8AMIIBCgKCAQEAqRS0ZKh44Y1GHvD4/ryduaelVtfvqkdCmhxpCp7OTjIA\n/gPuVoBA31gxqMVcpDgIAk8dfqds0WFzFe2byhbBalNm3+FSYJkEKa1mdCnqM/mL\nt6O0V/dPv2dcepDluwWbHJIuFf5elH1F8eeyqZV5w6c980lOyDO0DVNqB6pjGlPq\njEVcvEdEtGSfIX3B2tmODilwUvl/lGjhnK6ghfots7i1Xno9VAY/YTqR0T+lyPx4\n23r+22gstJ7XCLA7aqfRyFyYaVKqubHPBwz2qKiBTc3Shc3ii/OHc5KjTpADNRDv\nvH7X5kOXYtdpGbMsJ1uY+MPwfbOVkxy4tg4HFejmyQIDAQABo0IwQDAPBgNVHRMB\nAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAdBgNVHQ4EFgQUpshrlfvvw+zkoLKf\nxNUYD92/YxIwDQYJKoZIhvcNAQELBQADggEBAAWDMNe8HnoOPHF1sIUcCvJjBeUz\neB++l5Er9P+UPpkSr7+KpD+9DQGWmaOT57Vp7nBYXd42828h+cq7KEG2w5Uf6fYD\nBuitrzj2IzNznvKwOMh/qAePC17tH4mnkSnsJCMg6cvG99GG+vQoMQW7+D6VshIH\nm5hNThNGSPznk+eNk+NlIIVzD4autRn+U5geYzDaZIWfmx95gwCPK2VVw1IDExA+\naQiZi4g1JviUB97E92rZzX+Ai4GYk+CKQTxAiZPZ2M9gRFLrjKIGbRu7FaL+9lwU\nWnax4HJZ/cdVUtVp8VgaAOy7qvl5WGZ4eLopLhMkW3RyPiFr4+M3vNJocqU=\n-----END CERTIFICATE-----"
          }
        };

        (mockProjectDAL.findById as any).mockResolvedValue({
          id: "project-123",
          orgId: "org-123"
        });
        (mockLicenseService.getPlan as any).mockResolvedValue({
          pkiAcme: true
        });
        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);
        (mockCertificateProfileDAL.findByNameAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.create as any).mockResolvedValue({
          ...sampleProfile,
          enrollmentType: EnrollmentType.EST,
          estConfigId: "est-config-123"
        });

        const result = await service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: estProfileData
        });

        expect(result.enrollmentType).toBe(EnrollmentType.EST);
        expect(mockEstEnrollmentConfigDAL.create).toHaveBeenCalledWith(
          {
            disableBootstrapCaValidation: estProfileData.estConfig.disableBootstrapCaValidation,
            hashedPassphrase: "mocked-hash",
            encryptedCaChain: Buffer.from("encrypted-data")
          },
          undefined
        );
      });

      it("should handle profile slug uniqueness validation", async () => {
        vi.clearAllMocks();

        const duplicateSlugData = {
          slug: "different-profile-name",
          description: "Profile with duplicate slug",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfig: {
            autoRenew: true,
            renewBeforeDays: 30
          }
        };

        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);
        (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(sampleProfile);

        await expect(
          service.createProfile({
            ...mockActor,
            projectId: "project-123",
            data: duplicateSlugData
          })
        ).rejects.toThrow(ForbiddenRequestError);
      });

      it("should validate auto-renewal configuration", async () => {
        const autoRenewData = {
          slug: "auto-renew-profile",
          description: "Profile with auto-renewal",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfig: {
            autoRenew: true,
            renewBeforeDays: 7
          }
        };

        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);
        (mockCertificateProfileDAL.findByNameAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.create as any).mockResolvedValue({
          ...sampleProfile,
          apiConfigId: "api-config-123",
          enrollmentType: EnrollmentType.API
        });

        const result = await service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: autoRenewData
        });

        expect(mockApiEnrollmentConfigDAL.create).toHaveBeenCalledWith(
          {
            autoRenew: true,
            renewBeforeDays: 7
          },
          undefined
        );
        expect(result).toBeDefined();
      });
    });

    describe("profile lifecycle management", () => {
      it("should handle profile updates with enrollment type changes", async () => {
        const currentProfile = {
          ...sampleProfile,
          enrollmentType: EnrollmentType.API,
          apiConfigId: "api-config-123",
          estConfigId: null
        };

        const updateToEst = {
          enrollmentType: EnrollmentType.EST,
          estConfigId: "est-config-123",
          apiConfigId: null
        };

        (mockCertificateProfileDAL.findById as any).mockResolvedValue(currentProfile);
        (mockCertificateProfileDAL.updateById as any).mockResolvedValue({
          ...currentProfile,
          enrollmentType: EnrollmentType.EST,
          estConfigId: "est-config-123",
          apiConfigId: null
        });

        const result = await service.updateProfile({
          ...mockActor,
          profileId: "profile-123",
          data: updateToEst
        });

        expect(mockEstEnrollmentConfigDAL.create).not.toHaveBeenCalled();
        expect(result.enrollmentType).toBe(EnrollmentType.EST);
      });

      it("should allow deletion of profiles", async () => {
        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.deleteById as any).mockResolvedValue(sampleProfile);

        const result = await service.deleteProfile({
          ...mockActor,
          profileId: "profile-123"
        });

        expect(result).toEqual(sampleProfile);
        expect(mockCertificateProfileDAL.deleteById).toHaveBeenCalledWith("profile-123");
      });
    });

    describe("certificate management", () => {
      it("should filter certificates by status", async () => {
        const activeCerts = [
          {
            id: "cert-1",
            serialNumber: "123456",
            cn: "example.com",
            status: "active",
            notBefore: new Date(),
            notAfter: new Date(),
            isRevoked: false,
            createdAt: new Date()
          }
        ];

        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.getCertificatesByProfile as any).mockResolvedValue(activeCerts);

        const result = await service.getProfileCertificates({
          ...mockActor,
          profileId: "profile-123",
          status: "active"
        });

        expect(result).toEqual(activeCerts);
        expect(mockCertificateProfileDAL.getCertificatesByProfile).toHaveBeenCalledWith("profile-123", {
          offset: 0,
          limit: 20,
          status: "active",
          search: undefined
        });
      });

      it("should search certificates by common name", async () => {
        const searchResults = [
          {
            id: "cert-1",
            serialNumber: "123456",
            cn: "api.example.com",
            status: "active",
            notBefore: new Date(),
            notAfter: new Date(),
            isRevoked: false,
            createdAt: new Date()
          }
        ];

        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.getCertificatesByProfile as any).mockResolvedValue(searchResults);

        const result = await service.getProfileCertificates({
          ...mockActor,
          profileId: "profile-123",
          search: "api.example"
        });

        expect(result).toEqual(searchResults);
        expect(mockCertificateProfileDAL.getCertificatesByProfile).toHaveBeenCalledWith("profile-123", {
          offset: 0,
          limit: 20,
          status: undefined,
          search: "api.example"
        });
      });
    });

    describe("error scenarios", () => {
      it("should handle database connection errors gracefully", async () => {
        (mockCertificateProfileDAL.findById as any).mockRejectedValue(new Error("Database connection failed"));

        await expect(
          service.getProfileById({
            ...mockActor,
            profileId: "profile-123"
          })
        ).rejects.toThrow("Database connection failed");
      });

      it("should handle invalid template reference during profile creation", async () => {
        const profileData = {
          slug: "invalid-template-profile",
          description: "Profile with invalid template",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "nonexistent-template",
          apiConfig: {
            autoRenew: false
          }
        };

        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(null);

        await expect(
          service.createProfile({
            ...mockActor,
            projectId: "project-123",
            data: profileData
          })
        ).rejects.toThrow(NotFoundError);

        expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("nonexistent-template");
      });

      it("should handle concurrent profile creation conflicts", async () => {
        const conflictingData = {
          slug: "concurrent-profile",
          description: "Profile created concurrently",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfig: {
            autoRenew: false
          }
        };

        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);
        (mockCertificateProfileDAL.findByNameAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.create as any).mockRejectedValue(new Error("Unique constraint violation"));

        await expect(
          service.createProfile({
            ...mockActor,
            projectId: "project-123",
            data: conflictingData
          })
        ).rejects.toThrow("Unique constraint violation");
      });
    });

    describe("permission and security", () => {
      it("should validate project ownership for cross-project template access", async () => {
        const crossProjectData = {
          slug: "cross-project-profile",
          description: "Profile using template from different project",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-456",
          apiConfig: {
            autoRenew: false
          }
        };

        const foreignTemplate = {
          id: "template-456",
          projectId: "different-project-456",
          slug: "foreign-template"
        };

        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(foreignTemplate);

        await expect(
          service.createProfile({
            ...mockActor,
            projectId: "project-123",
            data: crossProjectData
          })
        ).rejects.toThrow(ForbiddenRequestError);
      });

      it("should validate slug format constraints", async () => {
        const invalidSlugData = {
          slug: "invalid-slug-profile",
          description: "Profile with invalid slug format",
          enrollmentType: EnrollmentType.API,
          issuerType: IssuerType.CA,
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfig: {
            autoRenew: false
          }
        };

        (mockCertificateTemplateV2DAL.findById as any).mockResolvedValue(sampleTemplate);
        (mockCertificateProfileDAL.findByNameAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.findBySlugAndProjectId as any).mockResolvedValue(null);
        (mockCertificateProfileDAL.create as any).mockResolvedValue({
          ...sampleProfile,
          slug: invalidSlugData.slug,
          enrollmentType: EnrollmentType.API
        });

        const result = await service.createProfile({
          ...mockActor,
          projectId: "project-123",
          data: invalidSlugData
        });

        expect(result.slug).toBe(invalidSlugData.slug);
      });
    });
  });

  describe("getEstConfigurationByProfile", () => {
    it("should return EST configuration for valid EST profile", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        ...sampleProfileWithConfigs,
        id: profileId,
        enrollmentType: EnrollmentType.EST,
        estConfig: {
          id: "est-config-123",
          disableBootstrapCaValidation: false,
          passphrase: "",
          caChain: "mock-ca-chain"
        }
      } as TCertificateProfileWithConfigs;

      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(mockProfile);

      const result = await service.getEstConfigurationByProfile({ ...mockActor, profileId });

      expect(result).toEqual({
        orgId: "project-123",
        isEnabled: true,
        caChain: "mock-ca-chain",
        disableBootstrapCertValidation: false,
        hashedPassphrase: ""
      });
    });

    it("should throw NotFoundError when profile doesn't exist", async () => {
      const profileId = "non-existent-profile";
      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(null);

      await expect(service.getEstConfigurationByProfile({ ...mockActor, profileId })).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenRequestError when profile is not configured for EST enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        ...sampleProfileWithConfigs,
        id: profileId,
        enrollmentType: EnrollmentType.API, // Wrong enrollment type
        estConfig: {
          id: "est-config-123",
          disableBootstrapCaValidation: false,
          passphrase: "",
          caChain: "mock-ca-chain"
        }
      } as TCertificateProfileWithConfigs;

      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(mockProfile);

      await expect(service.getEstConfigurationByProfile({ ...mockActor, profileId })).rejects.toThrow(
        ForbiddenRequestError
      );
      await expect(service.getEstConfigurationByProfile({ ...mockActor, profileId })).rejects.toThrow(
        "Profile is not configured for EST enrollment"
      );
    });

    it("should throw NotFoundError when EST configuration is missing", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        ...sampleProfileWithConfigs,
        id: profileId,
        enrollmentType: EnrollmentType.EST,
        estConfig: undefined // Missing EST config
      } as TCertificateProfileWithConfigs;

      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(mockProfile);

      await expect(service.getEstConfigurationByProfile({ ...mockActor, profileId })).rejects.toThrow(NotFoundError);
      await expect(service.getEstConfigurationByProfile({ ...mockActor, profileId })).rejects.toThrow(
        "EST configuration not found for this profile"
      );
    });
  });
});
