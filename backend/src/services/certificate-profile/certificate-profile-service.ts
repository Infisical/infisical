import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TCertificateTemplateV2DALFactory } from "../certificate-template-v2/certificate-template-v2-dal";
import { TApiEnrollmentConfigDALFactory } from "../enrollment-config/api-enrollment-config-dal";
import { TApiConfigData, TEstConfigData } from "../enrollment-config/enrollment-config-types";
import { TEstEnrollmentConfigDALFactory } from "../enrollment-config/est-enrollment-config-dal";
import { TCertificateProfileDALFactory } from "./certificate-profile-dal";
import {
  EnrollmentType,
  TCertificateProfile,
  TCertificateProfileCertificate,
  TCertificateProfileInsert,
  TCertificateProfileMetrics,
  TCertificateProfileUpdate,
  TCertificateProfileWithConfigs,
  TCertificateProfileWithRawMetrics
} from "./certificate-profile-types";

export type TCertificateProfileCreateData = Omit<TCertificateProfileInsert, "estConfigId" | "apiConfigId"> & {
  estConfig?: TEstConfigData;
  apiConfig?: TApiConfigData;
};

type TCertificateProfileServiceFactoryDep = {
  certificateProfileDAL: TCertificateProfileDALFactory;
  certificateTemplateV2DAL: TCertificateTemplateV2DALFactory;
  apiEnrollmentConfigDAL: TApiEnrollmentConfigDALFactory;
  estEnrollmentConfigDAL: TEstEnrollmentConfigDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateProfileServiceFactory = ReturnType<typeof certificateProfileServiceFactory>;

const convertDalToService = (dalResult: Record<string, unknown>): TCertificateProfile => {
  return {
    ...dalResult,
    enrollmentType: dalResult.enrollmentType as EnrollmentType
  } as TCertificateProfile;
};

const validateEnrollmentConfig = async (data: {
  enrollmentType: EnrollmentType;
  estConfig?: TEstConfigData | null;
  apiConfig?: TApiConfigData | null;
}): Promise<void> => {
  if (data.enrollmentType === EnrollmentType.EST) {
    if (!data.estConfig) {
      throw new ForbiddenRequestError({
        message: "EST enrollment type requires EST configuration"
      });
    }
    if (data.apiConfig) {
      throw new ForbiddenRequestError({
        message: "EST enrollment type cannot have API configuration"
      });
    }
  } else if (data.enrollmentType === EnrollmentType.API) {
    if (!data.apiConfig) {
      throw new ForbiddenRequestError({
        message: "API enrollment type requires API configuration"
      });
    }
    if (data.estConfig) {
      throw new ForbiddenRequestError({
        message: "API enrollment type cannot have EST configuration"
      });
    }
  }
};

const validateEnrollmentConfigForUpdate = async (data: {
  enrollmentType: EnrollmentType;
  estConfigId?: string | null;
  apiConfigId?: string | null;
}): Promise<void> => {
  if (data.enrollmentType === EnrollmentType.EST) {
    if (!data.estConfigId) {
      throw new ForbiddenRequestError({
        message: "EST enrollment type requires EST configuration ID"
      });
    }
    if (data.apiConfigId) {
      throw new ForbiddenRequestError({
        message: "EST enrollment type cannot have API configuration ID"
      });
    }
  } else if (data.enrollmentType === EnrollmentType.API) {
    if (!data.apiConfigId) {
      throw new ForbiddenRequestError({
        message: "API enrollment type requires API configuration ID"
      });
    }
    if (data.estConfigId) {
      throw new ForbiddenRequestError({
        message: "API enrollment type cannot have EST configuration ID"
      });
    }
  }
};

const hasEnrollmentConfigChanges = (data: TCertificateProfileUpdate): boolean => {
  return !!(data.enrollmentType || data.estConfigId || data.apiConfigId);
};

export const certificateProfileServiceFactory = ({
  certificateProfileDAL,
  certificateTemplateV2DAL,
  apiEnrollmentConfigDAL,
  estEnrollmentConfigDAL,
  permissionService
}: TCertificateProfileServiceFactoryDep) => {
  const createProfile = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    data
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    data: Omit<TCertificateProfileCreateData, "projectId">;
  }): Promise<TCertificateProfile> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Create,
      ProjectPermissionSub.CertificateProfiles
    );

    // Validate that certificate template exists and belongs to the same project
    if (data.certificateTemplateId) {
      const template = await certificateTemplateV2DAL.findById(data.certificateTemplateId);
      if (!template) {
        throw new NotFoundError({ message: "Certificate template not found" });
      }
      if (template.projectId !== projectId) {
        throw new ForbiddenRequestError({
          message: "Certificate template must belong to the same project"
        });
      }
    }

    // Check for slug uniqueness within project
    const existingSlugProfile = await certificateProfileDAL.findBySlugAndProjectId(data.slug, projectId);
    if (existingSlugProfile) {
      throw new ForbiddenRequestError({
        message: "Certificate profile with this slug already exists in project"
      });
    }

    // Validate enrollment type configuration
    await validateEnrollmentConfig({
      enrollmentType: data.enrollmentType,
      estConfig: data.estConfig,
      apiConfig: data.apiConfig
    });

    // Create enrollment configs based on type
    let estConfigId: string | null = null;
    let apiConfigId: string | null = null;

    if (data.enrollmentType === EnrollmentType.EST && data.estConfig) {
      const appCfg = getConfig();
      // Hash the passphrase
      const hashedPassphrase = await crypto.hashing().createHash(data.estConfig.passphrase, appCfg.SALT_ROUNDS);

      const estConfig = await estEnrollmentConfigDAL.create({
        disableBootstrapCaValidation: data.estConfig.disableBootstrapCaValidation,
        hashedPassphrase,
        encryptedCaChain: Buffer.from(data.estConfig.encryptedCaChain, "base64")
      });
      estConfigId = estConfig.id;
    } else if (data.enrollmentType === EnrollmentType.API && data.apiConfig) {
      const apiConfig = await apiEnrollmentConfigDAL.create({
        autoRenew: data.apiConfig.autoRenew,
        autoRenewDays: data.apiConfig.autoRenewDays
      });
      apiConfigId = apiConfig.id;
    }

    // Create the profile with the created config IDs
    const { estConfig, apiConfig, ...profileData } = data;
    const profile = await certificateProfileDAL.create({
      ...profileData,
      projectId,
      estConfigId,
      apiConfigId
    });

    return convertDalToService(profile);
  };

  const updateProfile = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    profileId,
    data
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    profileId: string;
    data: TCertificateProfileUpdate;
  }): Promise<TCertificateProfile> => {
    const existingProfile = await certificateProfileDAL.findById(profileId);
    if (!existingProfile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: existingProfile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Edit,
      ProjectPermissionSub.CertificateProfiles
    );

    if (data.certificateTemplateId) {
      const template = await certificateTemplateV2DAL.findById(data.certificateTemplateId);
      if (!template) {
        throw new NotFoundError({ message: "Certificate template not found" });
      }
      if (template.projectId !== existingProfile.projectId) {
        throw new ForbiddenRequestError({
          message: "Certificate template must belong to the same project"
        });
      }
    }

    if (data.slug && data.slug !== existingProfile.slug) {
      const conflictingProfile = await certificateProfileDAL.findBySlugAndProjectId(
        data.slug,
        existingProfile.projectId
      );
      if (conflictingProfile && conflictingProfile.id !== profileId) {
        throw new ForbiddenRequestError({
          message: "Certificate profile with this slug already exists in project"
        });
      }
    }

    if (hasEnrollmentConfigChanges(data)) {
      const mergedData = { ...existingProfile, ...data };
      await validateEnrollmentConfigForUpdate({
        enrollmentType: mergedData.enrollmentType as EnrollmentType,
        estConfigId: mergedData.estConfigId,
        apiConfigId: mergedData.apiConfigId
      });
    }

    const { estConfig, apiConfig, ...profileUpdateData } = data;

    if (estConfig && existingProfile.estConfigId) {
      await estEnrollmentConfigDAL.updateById(existingProfile.estConfigId, {
        disableBootstrapCaValidation: estConfig.disableBootstrapCaValidation,
        ...(estConfig.passphrase && {
          hashedPassphrase: await crypto.hashing().createHash(estConfig.passphrase, getConfig().SALT_ROUNDS)
        }),
        ...(estConfig.caChain && {
          encryptedCaChain: Buffer.from(estConfig.caChain, "base64")
        })
      });
    }

    if (apiConfig && existingProfile.apiConfigId) {
      await apiEnrollmentConfigDAL.updateById(existingProfile.apiConfigId, {
        autoRenew: apiConfig.autoRenew,
        autoRenewDays: apiConfig.autoRenewDays
      });
    }

    const updatedProfile = await certificateProfileDAL.updateById(profileId, profileUpdateData);
    return convertDalToService(updatedProfile);
  };

  const getProfileById = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    profileId,
    includeMetrics = false,
    expiringDays = 30
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    profileId: string;
    includeMetrics?: boolean;
    expiringDays?: number;
  }): Promise<TCertificateProfile & { metrics?: TCertificateProfileMetrics }> => {
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: profile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const converted = convertDalToService(profile);

    if (includeMetrics) {
      const metrics = await certificateProfileDAL.getProfileMetrics(profileId, expiringDays);
      return {
        ...converted,
        metrics
      };
    }

    return converted;
  };

  const getProfileByIdWithConfigs = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    profileId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    profileId: string;
  }): Promise<TCertificateProfileWithConfigs> => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: profile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    return {
      ...profile,
      enrollmentType: profile.enrollmentType as EnrollmentType
    };
  };

  const getProfileBySlug = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    slug
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    slug: string;
  }): Promise<TCertificateProfile> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const profile = await certificateProfileDAL.findBySlugAndProjectId(slug, projectId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    return convertDalToService(profile);
  };

  const listProfiles = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    offset = 0,
    limit = 20,
    search,
    enrollmentType,
    caId,
    includeMetrics = false,
    expiringDays = 30
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    offset?: number;
    limit?: number;
    search?: string;
    enrollmentType?: EnrollmentType;
    caId?: string;
    includeMetrics?: boolean;
    expiringDays?: number;
  }): Promise<{
    profiles: (TCertificateProfile & { metrics?: TCertificateProfileMetrics })[];
    totalCount: number;
  }> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const profiles = await certificateProfileDAL.findByProjectId(projectId, {
      offset,
      limit,
      search,
      enrollmentType,
      caId,
      includeMetrics,
      expiringDays
    });

    const totalCount = await certificateProfileDAL.countByProjectId(projectId, {
      search,
      enrollmentType,
      caId
    });

    const convertedProfiles = profiles.map((profile) => {
      const converted = convertDalToService(profile);
      if (includeMetrics) {
        const profileWithMetrics = profile as TCertificateProfileWithRawMetrics;
        return {
          ...converted,
          metrics: {
            profileId: converted.id,
            totalCertificates: parseInt(String(profileWithMetrics.total_certificates || 0), 10),
            activeCertificates: parseInt(String(profileWithMetrics.active_certificates || 0), 10),
            expiredCertificates: parseInt(String(profileWithMetrics.expired_certificates || 0), 10),
            expiringCertificates: parseInt(String(profileWithMetrics.expiring_certificates || 0), 10),
            revokedCertificates: parseInt(String(profileWithMetrics.revoked_certificates || 0), 10)
          }
        };
      }
      return converted;
    });

    return {
      profiles: convertedProfiles,
      totalCount
    };
  };

  const deleteProfile = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    profileId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    profileId: string;
  }): Promise<TCertificateProfile> => {
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: profile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Delete,
      ProjectPermissionSub.CertificateProfiles
    );

    // Check if profile is in use by any certificates
    const isInUse = await certificateProfileDAL.isProfileInUse(profileId);
    if (isInUse) {
      throw new ForbiddenRequestError({
        message: "Cannot delete certificate profile that has issued certificates"
      });
    }

    const deletedProfile = await certificateProfileDAL.deleteById(profileId);
    if (!deletedProfile) {
      throw new NotFoundError({ message: "Failed to delete certificate profile" });
    }
    return convertDalToService(deletedProfile);
  };

  const getProfileCertificates = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    profileId,
    offset = 0,
    limit = 20,
    status,
    search
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    profileId: string;
    offset?: number;
    limit?: number;
    status?: "active" | "expired" | "revoked";
    search?: string;
  }): Promise<TCertificateProfileCertificate[]> => {
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: profile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const certificates = await certificateProfileDAL.getCertificatesByProfile(profileId, {
      offset,
      limit,
      status,
      search
    });

    return certificates;
  };

  const getProfileMetrics = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    profileId,
    expiringDays = 30
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    profileId: string;
    expiringDays?: number;
  }): Promise<TCertificateProfileMetrics> => {
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: profile.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const metrics = await certificateProfileDAL.getProfileMetrics(profileId, expiringDays);
    return metrics;
  };

  const getEstConfigurationByProfile = async ({ profileId }: { profileId: string }) => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (profile.enrollmentType !== EnrollmentType.EST) {
      throw new ForbiddenRequestError({
        message: "Profile is not configured for EST enrollment"
      });
    }

    if (!profile.estConfigEncryptedCaChain) {
      throw new NotFoundError({ message: "EST configuration not found for this profile" });
    }

    return {
      orgId: profile.projectId,
      isEnabled: true,
      caChain: profile.estConfigEncryptedCaChain.toString("base64"),
      disableBootstrapCertValidation: profile.estConfigDisableBootstrapCaValidation,
      hashedPassphrase: profile.estConfigHashedPassphrase
    };
  };

  return {
    createProfile,
    updateProfile,
    getProfileById,
    getProfileByIdWithConfigs,
    getProfileBySlug,
    listProfiles,
    deleteProfile,
    getProfileCertificates,
    getProfileMetrics,
    getEstConfigurationByProfile
  };
};
