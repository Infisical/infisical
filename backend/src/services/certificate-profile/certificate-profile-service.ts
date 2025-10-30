import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { isCertChainValid } from "../certificate/certificate-fns";
import { TCertificateTemplateV2DALFactory } from "../certificate-template-v2/certificate-template-v2-dal";
import { TApiEnrollmentConfigDALFactory } from "../enrollment-config/api-enrollment-config-dal";
import { TApiConfigData, TEstConfigData } from "../enrollment-config/enrollment-config-types";
import { TEstEnrollmentConfigDALFactory } from "../enrollment-config/est-enrollment-config-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { TCertificateProfileDALFactory } from "./certificate-profile-dal";
import {
  EnrollmentType,
  TCertificateProfile,
  TCertificateProfileCertificate,
  TCertificateProfileInsert,
  TCertificateProfileUpdate,
  TCertificateProfileWithConfigs
} from "./certificate-profile-types";

const validateAndEncryptPemCaChain = async (
  caChain: string,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey">,
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">
) => {
  try {
    const certificates = extractX509CertFromChain(caChain)?.map((cert) => new x509.X509Certificate(cert));

    if (!certificates || certificates.length === 0) {
      throw new BadRequestError({ message: "Failed to parse certificate chain" });
    }

    if (!(await isCertChainValid(certificates))) {
      throw new BadRequestError({ message: "Invalid certificate chain" });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const { cipherTextBlob } = await kmsEncryptor({
      plainText: Buffer.from(caChain)
    });

    return { encryptedCaChain: cipherTextBlob };
  } catch (error) {
    throw new BadRequestError({ message: `Failed to process certificate chain: ${(error as Error).message}` });
  }
};

const decryptCaChain = async (
  encryptedCaChain: Buffer,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "decryptWithKmsKey">,
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">
): Promise<string> => {
  try {
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaChain = await kmsDecryptor({
      cipherTextBlob: encryptedCaChain
    });

    return decryptedCaChain.toString();
  } catch (error) {
    throw new BadRequestError({ message: `Failed to decrypt certificate chain: ${(error as Error).message}` });
  }
};

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
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
};

export type TCertificateProfileServiceFactory = ReturnType<typeof certificateProfileServiceFactory>;

const convertDalToService = (dalResult: Record<string, unknown>): TCertificateProfile => {
  return {
    ...dalResult,
    enrollmentType: dalResult.enrollmentType as EnrollmentType
  } as TCertificateProfile;
};

export const certificateProfileServiceFactory = ({
  certificateProfileDAL,
  certificateTemplateV2DAL,
  apiEnrollmentConfigDAL,
  estEnrollmentConfigDAL,
  permissionService,
  kmsService,
  projectDAL
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
        message: "Certificate profile with this name already exists in project"
      });
    }

    // Validate enrollment configuration requirements
    if (data.enrollmentType === EnrollmentType.EST && !data.estConfig) {
      throw new ForbiddenRequestError({
        message: "EST enrollment requires EST configuration"
      });
    }
    if (data.enrollmentType === EnrollmentType.API && !data.apiConfig) {
      throw new ForbiddenRequestError({
        message: "API enrollment requires API configuration"
      });
    }

    // Create enrollment configs and profile
    const profile = await certificateProfileDAL.transaction(async (tx) => {
      let estConfigId: string | null = null;
      let apiConfigId: string | null = null;

      if (data.enrollmentType === EnrollmentType.EST && data.estConfig) {
        const appCfg = getConfig();
        // Hash the passphrase
        const hashedPassphrase = await crypto.hashing().createHash(data.estConfig.passphrase, appCfg.SALT_ROUNDS);

        let encryptedCaChainBuffer: Buffer | null = null;
        if (!data.estConfig.disableBootstrapCaValidation && data.estConfig.caChain) {
          const { encryptedCaChain } = await validateAndEncryptPemCaChain(
            data.estConfig.caChain,
            projectId,
            kmsService,
            projectDAL
          );
          encryptedCaChainBuffer = encryptedCaChain;
        }

        const estConfig = await estEnrollmentConfigDAL.create(
          {
            disableBootstrapCaValidation: data.estConfig.disableBootstrapCaValidation,
            hashedPassphrase,
            encryptedCaChain: encryptedCaChainBuffer
          },
          tx
        );
        estConfigId = estConfig.id;
      } else if (data.enrollmentType === EnrollmentType.API && data.apiConfig) {
        const apiConfig = await apiEnrollmentConfigDAL.create(
          {
            autoRenew: data.apiConfig.autoRenew,
            renewBeforeDays: data.apiConfig.renewBeforeDays
          },
          tx
        );
        apiConfigId = apiConfig.id;
      }

      // Create the profile with the created config IDs
      const { estConfig, apiConfig, ...profileData } = data;
      const profileResult = await certificateProfileDAL.create(
        {
          ...profileData,
          projectId,
          estConfigId,
          apiConfigId
        },
        tx
      );

      return profileResult;
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
          message: "Certificate profile with this name already exists in project"
        });
      }
    }

    const { estConfig, apiConfig, ...profileUpdateData } = data;

    const updatedProfile = await certificateProfileDAL.transaction(async (tx) => {
      if (estConfig && existingProfile.estConfigId) {
        const updateData: {
          disableBootstrapCaValidation: boolean;
          hashedPassphrase?: string;
          encryptedCaChain?: Buffer;
        } = {
          disableBootstrapCaValidation: estConfig.disableBootstrapCaValidation ?? false
        };

        if (estConfig.passphrase) {
          updateData.hashedPassphrase = await crypto
            .hashing()
            .createHash(estConfig.passphrase, getConfig().SALT_ROUNDS);
        }

        if (estConfig.caChain) {
          const { encryptedCaChain } = await validateAndEncryptPemCaChain(
            estConfig.caChain,
            existingProfile.projectId,
            kmsService,
            projectDAL
          );
          updateData.encryptedCaChain = encryptedCaChain;
        }

        await estEnrollmentConfigDAL.updateById(existingProfile.estConfigId, updateData, tx);
      }

      if (apiConfig && existingProfile.apiConfigId) {
        await apiEnrollmentConfigDAL.updateById(
          existingProfile.apiConfigId,
          {
            autoRenew: apiConfig.autoRenew,
            renewBeforeDays: apiConfig.renewBeforeDays
          },
          tx
        );
      }

      const profileResult = await certificateProfileDAL.updateById(profileId, profileUpdateData, tx);
      return profileResult;
    });

    return convertDalToService(updatedProfile);
  };

  const getProfileById = async ({
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
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const converted = convertDalToService(profile);

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

    if (profile.estConfig && profile.estConfig.caChain) {
      try {
        const estConfig = await estEnrollmentConfigDAL.findById(profile.estConfigId!);
        if (estConfig && estConfig.encryptedCaChain) {
          const decryptedCaChain = await decryptCaChain(
            estConfig.encryptedCaChain,
            profile.projectId,
            kmsService,
            projectDAL
          );
          profile.estConfig.caChain = decryptedCaChain;
        } else {
          profile.estConfig.caChain = "";
        }
      } catch (error) {
        profile.estConfig.caChain = "";
      }
    }

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
    caId
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
  }): Promise<{
    profiles: TCertificateProfileWithConfigs[];
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
      caId
    });

    const totalCount = await certificateProfileDAL.countByProjectId(projectId, {
      search,
      enrollmentType,
      caId
    });

    const convertedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const profileWithConfigs = profile as TCertificateProfileWithConfigs;

        let decryptedEstConfig = profileWithConfigs.estConfig;
        if (decryptedEstConfig && profileWithConfigs.estConfigId) {
          try {
            const estConfig = await estEnrollmentConfigDAL.findById(profileWithConfigs.estConfigId);
            if (estConfig && estConfig.encryptedCaChain) {
              const decryptedCaChain = await decryptCaChain(
                estConfig.encryptedCaChain,
                projectId,
                kmsService,
                projectDAL
              );
              decryptedEstConfig = {
                ...decryptedEstConfig,
                caChain: decryptedCaChain
              };
            } else if (decryptedEstConfig) {
              decryptedEstConfig = {
                ...decryptedEstConfig,
                caChain: ""
              };
            }
          } catch (error) {
            if (decryptedEstConfig) {
              decryptedEstConfig = {
                ...decryptedEstConfig,
                caChain: ""
              };
            }
          }
        }

        const converted = convertDalToService(profileWithConfigs);
        const result: TCertificateProfileWithConfigs = {
          ...converted,
          estConfig: decryptedEstConfig,
          apiConfig: profileWithConfigs.apiConfig
        };

        return result;
      })
    );

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

  const getEstConfigurationByProfile = async (
    params:
      | {
          profileId: string;
          isInternal: true;
        }
      | {
          actor: ActorType;
          actorId: string;
          actorAuthMethod: ActorAuthMethod;
          actorOrgId: string | undefined;
          profileId: string;
          isInternal?: false;
        }
  ) => {
    const { profileId, isInternal = false } = params;
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    if (!isInternal) {
      const { actor, actorId, actorAuthMethod, actorOrgId } = params as {
        actor: ActorType;
        actorId: string;
        actorAuthMethod: ActorAuthMethod;
        actorOrgId: string | undefined;
      };

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
    }

    if (profile.enrollmentType !== EnrollmentType.EST) {
      throw new ForbiddenRequestError({
        message: "Profile is not configured for EST enrollment"
      });
    }

    if (!profile.estConfig) {
      throw new NotFoundError({ message: "EST configuration not found for this profile" });
    }

    return {
      orgId: profile.projectId,
      isEnabled: true,
      caChain: profile.estConfig.caChain,
      disableBootstrapCertValidation: profile.estConfig.disableBootstrapCaValidation,
      hashedPassphrase: profile.estConfig.passphrase
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
    getEstConfigurationByProfile
  };
};
