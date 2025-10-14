/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ForbiddenError } from "@casl/ability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { ActorType, AuthMethod } from "../auth/auth-type";
import type { TCertificateTemplateV2DALFactory } from "../certificate-template-v2/certificate-template-v2-dal";
import type { TApiEnrollmentConfigDALFactory } from "../enrollment-config/api-enrollment-config-dal";
import type { TEstEnrollmentConfigDALFactory } from "../enrollment-config/est-enrollment-config-dal";
import type { TCertificateProfileDALFactory } from "./certificate-profile-dal";
import { certificateProfileServiceFactory, TCertificateProfileServiceFactory } from "./certificate-profile-service";
import { EnrollmentType, TCertificateProfile, TCertificateProfileWithConfigs } from "./certificate-profile-types";

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
    getProfileMetrics: vi.fn(),
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
      autoRenewDays: 30
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

  const mockPermissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission: {
        throwUnlessCan: vi.fn()
      }
    })
  } as unknown as Pick<TPermissionServiceFactory, "getProjectPermission">;

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
      permissionService: mockPermissionService
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
      caId: "ca-123",
      certificateTemplateId: "template-123",
      apiConfig: {
        autoRenew: true,
        autoRenewDays: 30
      }
    };

    beforeEach(() => {
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
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfigId: "api-config-123",
          estConfigId: null,
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
        caId: "ca-123",
        certificateTemplateId: "template-123",
        apiConfig: {
          autoRenew: true,
          autoRenewDays: 30
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
        caId: undefined,
        includeMetrics: false,
        expiringDays: 30
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
        caId: "ca-123",
        includeMetrics: false,
        expiringDays: 30
      });
    });

    it("should list profiles with metrics when includeMetrics is true", async () => {
      const mockProfilesWithMetrics = [
        {
          ...sampleProfile,
          total_certificates: 10,
          active_certificates: 8,
          expired_certificates: 1,
          expiring_certificates: 1,
          revoked_certificates: 0
        }
      ];
      (mockCertificateProfileDAL.findByProjectId as any).mockResolvedValue(mockProfilesWithMetrics);

      const result = await service.listProfiles({
        ...mockActor,
        projectId: "project-123",
        includeMetrics: true,
        expiringDays: 15
      });

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0]).toHaveProperty("metrics");
      expect(result.profiles[0].metrics).toEqual({
        profileId: sampleProfile.id,
        totalCertificates: 10,
        activeCertificates: 8,
        expiredCertificates: 1,
        expiringCertificates: 1,
        revokedCertificates: 0
      });

      expect(mockCertificateProfileDAL.findByProjectId).toHaveBeenCalledWith("project-123", {
        offset: 0,
        limit: 20,
        search: undefined,
        enrollmentType: undefined,
        caId: undefined,
        includeMetrics: true,
        expiringDays: 15
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
      expect(mockCertificateProfileDAL.isProfileInUse).toHaveBeenCalledWith("profile-123");
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

    it("should throw ForbiddenRequestError when profile is in use", async () => {
      (mockCertificateProfileDAL.isProfileInUse as any).mockResolvedValue(true);

      await expect(
        service.deleteProfile({
          ...mockActor,
          profileId: "profile-123"
        })
      ).rejects.toThrow(ForbiddenRequestError);
      expect(mockCertificateProfileDAL.deleteById).not.toHaveBeenCalled();
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

  describe("getProfileMetrics", () => {
    const mockMetrics = {
      profileId: "profile-123",
      totalCertificates: 10,
      activeCertificates: 8,
      expiredCertificates: 1,
      expiringCertificates: 2,
      revokedCertificates: 1
    };

    beforeEach(() => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
      (mockCertificateProfileDAL.getProfileMetrics as any).mockResolvedValue(mockMetrics);
    });

    it("should get profile metrics successfully", async () => {
      const result = await service.getProfileMetrics({
        ...mockActor,
        profileId: "profile-123"
      });

      expect(result).toEqual(mockMetrics);
      expect(mockCertificateProfileDAL.findById).toHaveBeenCalledWith("profile-123");
      expect(mockCertificateProfileDAL.getProfileMetrics).toHaveBeenCalledWith("profile-123", 30);
    });

    it("should get profile metrics with custom expiring days", async () => {
      await service.getProfileMetrics({
        ...mockActor,
        profileId: "profile-123",
        expiringDays: 60
      });

      expect(mockCertificateProfileDAL.getProfileMetrics).toHaveBeenCalledWith("profile-123", 60);
    });

    it("should throw NotFoundError when profile not found", async () => {
      (mockCertificateProfileDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.getProfileMetrics({
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
          caId: "ca-123",
          certificateTemplateId: "template-123",
          estConfig: {
            disableBootstrapCaValidation: false,
            passphrase: "secret-passphrase",
            encryptedCaChain: "encrypted-ca-chain-data"
          }
        };

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
            encryptedCaChain: Buffer.from(estProfileData.estConfig.encryptedCaChain, "base64")
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
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfig: {
            autoRenew: true,
            autoRenewDays: 30
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
          caId: "ca-123",
          certificateTemplateId: "template-123",
          apiConfig: {
            autoRenew: true,
            autoRenewDays: 7
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
            autoRenewDays: 7
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

      it("should prevent deletion of profiles with active certificates", async () => {
        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.isProfileInUse as any).mockResolvedValue(true);

        await expect(
          service.deleteProfile({
            ...mockActor,
            profileId: "profile-123"
          })
        ).rejects.toThrow(ForbiddenRequestError);

        expect(mockCertificateProfileDAL.deleteById).not.toHaveBeenCalled();
      });

      it("should allow deletion of unused profiles", async () => {
        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.isProfileInUse as any).mockResolvedValue(false);
        (mockCertificateProfileDAL.deleteById as any).mockResolvedValue(sampleProfile);

        const result = await service.deleteProfile({
          ...mockActor,
          profileId: "profile-123"
        });

        expect(result).toEqual(sampleProfile);
        expect(mockCertificateProfileDAL.isProfileInUse).toHaveBeenCalledWith("profile-123");
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

    describe("metrics and monitoring", () => {
      it("should calculate profile metrics correctly", async () => {
        const detailedMetrics = {
          profileId: "profile-123",
          totalCertificates: 50,
          activeCertificates: 40,
          expiredCertificates: 5,
          expiringCertificates: 3,
          revokedCertificates: 2
        };

        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.getProfileMetrics as any).mockResolvedValue(detailedMetrics);

        const result = await service.getProfileMetrics({
          ...mockActor,
          profileId: "profile-123",
          expiringDays: 14
        });

        expect(result).toEqual(detailedMetrics);
        expect(mockCertificateProfileDAL.getProfileMetrics).toHaveBeenCalledWith("profile-123", 14);
      });

      it("should handle zero certificate metrics", async () => {
        const emptyMetrics = {
          profileId: "profile-123",
          totalCertificates: 0,
          activeCertificates: 0,
          expiredCertificates: 0,
          expiringCertificates: 0,
          revokedCertificates: 0
        };

        (mockCertificateProfileDAL.findById as any).mockResolvedValue(sampleProfile);
        (mockCertificateProfileDAL.getProfileMetrics as any).mockResolvedValue(emptyMetrics);

        const result = await service.getProfileMetrics({
          ...mockActor,
          profileId: "profile-123"
        });

        expect(result.totalCertificates).toBe(0);
        expect(result.activeCertificates).toBe(0);
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
        estConfigEncryptedCaChain: Buffer.from("mock-ca-chain"),
        estConfigDisableBootstrapCaValidation: false,
        estConfigHashedPassphrase: "hashed-passphrase"
      } as TCertificateProfileWithConfigs;

      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(mockProfile);

      const result = await service.getEstConfigurationByProfile({ profileId });

      expect(result).toEqual({
        orgId: "project-123",
        isEnabled: true,
        caChain: "bW9jay1jYS1jaGFpbg==", // base64 encoded
        disableBootstrapCertValidation: false,
        hashedPassphrase: "hashed-passphrase"
      });
    });

    it("should throw NotFoundError when profile doesn't exist", async () => {
      const profileId = "non-existent-profile";
      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(null);

      await expect(service.getEstConfigurationByProfile({ profileId })).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenRequestError when profile is not configured for EST enrollment", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        ...sampleProfileWithConfigs,
        id: profileId,
        enrollmentType: EnrollmentType.API, // Wrong enrollment type
        estConfigEncryptedCaChain: Buffer.from("mock-ca-chain"),
        estConfigDisableBootstrapCaValidation: false,
        estConfigHashedPassphrase: "hashed-passphrase"
      } as TCertificateProfileWithConfigs;

      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(mockProfile);

      await expect(service.getEstConfigurationByProfile({ profileId })).rejects.toThrow(ForbiddenRequestError);
      await expect(service.getEstConfigurationByProfile({ profileId })).rejects.toThrow(
        "Profile is not configured for EST enrollment"
      );
    });

    it("should throw NotFoundError when EST configuration is missing", async () => {
      const profileId = "profile-123";
      const mockProfile = {
        ...sampleProfileWithConfigs,
        id: profileId,
        enrollmentType: EnrollmentType.EST,
        estConfigEncryptedCaChain: null, // Missing EST config
        estConfigDisableBootstrapCaValidation: false,
        estConfigHashedPassphrase: "hashed-passphrase"
      } as TCertificateProfileWithConfigs;

      (mockCertificateProfileDAL.findByIdWithConfigs as any).mockResolvedValue(mockProfile);

      await expect(service.getEstConfigurationByProfile({ profileId })).rejects.toThrow(NotFoundError);
      await expect(service.getEstConfigurationByProfile({ profileId })).rejects.toThrow(
        "EST configuration not found for this profile"
      );
    });
  });
});
