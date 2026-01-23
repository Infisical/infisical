import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { buildUrl } from "@app/ee/services/pki-acme/pki-acme-fns";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { getCertificateCredentials, isCertChainValid } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaType } from "../certificate-authority/certificate-authority-enums";
import { TExternalCertificateAuthorityDALFactory } from "../certificate-authority/external-certificate-authority-dal";
import { TCertificatePolicyDALFactory } from "../certificate-policy/certificate-policy-dal";
import { TAcmeEnrollmentConfigDALFactory } from "../enrollment-config/acme-enrollment-config-dal";
import { TApiEnrollmentConfigDALFactory } from "../enrollment-config/api-enrollment-config-dal";
import { TAcmeConfigData, TApiConfigData, TEstConfigData } from "../enrollment-config/enrollment-config-types";
import { TEstEnrollmentConfigDALFactory } from "../enrollment-config/est-enrollment-config-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { TCertificateProfileDALFactory } from "./certificate-profile-dal";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfile,
  TCertificateProfileCertificate,
  TCertificateProfileInsert,
  TCertificateProfileUpdate,
  TCertificateProfileWithConfigs
} from "./certificate-profile-types";

const validateIssuerTypeConstraints = (
  issuerType: IssuerType,
  enrollmentType: EnrollmentType,
  caId: string | null,
  existingCaId?: string | null
) => {
  if (issuerType === IssuerType.CA) {
    if (!caId && !existingCaId) {
      throw new ForbiddenRequestError({
        message: "CA issuer type requires a Certificate Authority to be selected"
      });
    }
  }

  if (issuerType === IssuerType.SELF_SIGNED) {
    if (caId) {
      throw new ForbiddenRequestError({
        message: "Self-signed issuer type cannot have a Certificate Authority"
      });
    }
    if (enrollmentType !== EnrollmentType.API) {
      throw new ForbiddenRequestError({
        message: "Self-signed issuer type only supports API enrollment"
      });
    }
  }
};

const validateTemplateByExternalCaType = (
  externalCaType: CaType | undefined,
  externalConfigs: Record<string, unknown> | null | undefined
) => {
  if (!externalCaType) return;

  switch (externalCaType) {
    case CaType.AZURE_AD_CS:
      if (!externalConfigs?.template || typeof externalConfigs.template !== "string") {
        throw new ForbiddenRequestError({
          message: "Azure ADCS Certificate Authority requires a template to be specified in external configs"
        });
      }
      break;
    default:
      break;
  }
};

const validateExternalConfigs = async (
  externalConfigs: Record<string, unknown> | null | undefined,
  caId: string | null,
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">,
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "findOne">
) => {
  if (!externalConfigs) return;

  if (!caId) {
    throw new ForbiddenRequestError({
      message: "External configs can only be specified when a Certificate Authority is selected"
    });
  }

  const ca = await certificateAuthorityDAL.findById(caId);
  if (!ca) {
    throw new NotFoundError({ message: "Certificate Authority not found" });
  }

  const externalCa = await externalCertificateAuthorityDAL.findOne({ caId });

  if (!externalCa) {
    throw new ForbiddenRequestError({
      message: "External configs can only be specified for external Certificate Authorities"
    });
  }

  validateTemplateByExternalCaType(externalCa.type as CaType, externalConfigs);
};

const generateAndEncryptAcmeEabSecret = async (
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey">,
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">
) => {
  try {
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const appCfg = getConfig();
    const secret = crypto.randomBytes(32).toString("hex");
    const secretHash = await crypto.hashing().createHash(secret, appCfg.SALT_ROUNDS);

    const { cipherTextBlob } = await kmsEncryptor({
      plainText: Buffer.from(secretHash)
    });

    return { encryptedEabSecret: cipherTextBlob };
  } catch (error) {
    throw new BadRequestError({ message: `Failed to generate ACME EAB secret: ${(error as Error).message}` });
  }
};

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

export type TCertificateProfileCreateData = Omit<
  TCertificateProfileInsert,
  "estConfigId" | "apiConfigId" | "acmeConfigId"
> & {
  estConfig?: TEstConfigData;
  apiConfig?: TApiConfigData;
  acmeConfig?: TAcmeConfigData;
};

type TCertificateProfileServiceFactoryDep = {
  certificateProfileDAL: TCertificateProfileDALFactory;
  certificatePolicyDAL: TCertificatePolicyDALFactory;
  apiEnrollmentConfigDAL: TApiEnrollmentConfigDALFactory;
  estEnrollmentConfigDAL: TEstEnrollmentConfigDALFactory;
  acmeEnrollmentConfigDAL: TAcmeEnrollmentConfigDALFactory;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "findById" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
};

export type TCertificateProfileServiceFactory = ReturnType<typeof certificateProfileServiceFactory>;

const convertDalToService = (dalResult: Record<string, unknown>): TCertificateProfile => {
  let parsedExternalConfigs: Record<string, unknown> | null = null;
  if (dalResult.externalConfigs && typeof dalResult.externalConfigs === "string") {
    try {
      parsedExternalConfigs = JSON.parse(dalResult.externalConfigs) as Record<string, unknown>;
    } catch {
      parsedExternalConfigs = null;
    }
  } else if (dalResult.externalConfigs && typeof dalResult.externalConfigs === "object") {
    parsedExternalConfigs = dalResult.externalConfigs as Record<string, unknown>;
  }

  return {
    ...dalResult,
    enrollmentType: dalResult.enrollmentType as EnrollmentType,
    issuerType: dalResult.issuerType as IssuerType,
    externalConfigs: parsedExternalConfigs
  } as TCertificateProfile;
};

export const certificateProfileServiceFactory = ({
  certificateProfileDAL,
  certificatePolicyDAL,
  apiEnrollmentConfigDAL,
  estEnrollmentConfigDAL,
  acmeEnrollmentConfigDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: data.slug
      })
    );

    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    // Validate that certificate policy exists and belongs to the same project
    if (data.certificatePolicyId) {
      const policy = await certificatePolicyDAL.findById(data.certificatePolicyId);
      if (!policy) {
        throw new NotFoundError({ message: "Certificate policy not found" });
      }
      if (policy.projectId !== projectId) {
        throw new ForbiddenRequestError({
          message: "Certificate policy must belong to the same project"
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

    validateIssuerTypeConstraints(data.issuerType, data.enrollmentType, data.caId ?? null);

    // Validate external configs
    await validateExternalConfigs(
      data.externalConfigs,
      data.caId ?? null,
      certificateAuthorityDAL,
      externalCertificateAuthorityDAL
    );

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
    // TODO: acme type currently doesn't require config obj, but add a check in the future if
    //       we have options

    // Create enrollment configs and profile
    const profile = await certificateProfileDAL.transaction(async (tx) => {
      let estConfigId: string | null = null;
      let apiConfigId: string | null = null;
      let acmeConfigId: string | null = null;

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
      } else if (data.enrollmentType === EnrollmentType.ACME && data.acmeConfig) {
        const { encryptedEabSecret } = await generateAndEncryptAcmeEabSecret(projectId, kmsService, projectDAL);
        const acmeConfig = await acmeEnrollmentConfigDAL.create(
          {
            skipDnsOwnershipVerification: data.acmeConfig.skipDnsOwnershipVerification ?? false,
            encryptedEabSecret
          },
          tx
        );
        acmeConfigId = acmeConfig.id;
      }

      // Create the profile with the created config IDs
      const { estConfig, apiConfig, acmeConfig, ...profileData } = data;
      const profileResult = await certificateProfileDAL.create(
        {
          ...profileData,
          projectId,
          estConfigId,
          apiConfigId,
          acmeConfigId,
          externalConfigs: data.externalConfigs
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: existingProfile.slug
      })
    );

    if (data.certificatePolicyId) {
      const policy = await certificatePolicyDAL.findById(data.certificatePolicyId);
      if (!policy) {
        throw new NotFoundError({ message: "Certificate policy not found" });
      }
      if (policy.projectId !== existingProfile.projectId) {
        throw new ForbiddenRequestError({
          message: "Certificate policy must belong to the same project"
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

    const finalIssuerType = data.issuerType || existingProfile.issuerType;
    const finalEnrollmentType = data.enrollmentType || existingProfile.enrollmentType;
    const finalCaId = data.caId !== undefined ? data.caId : existingProfile.caId;

    validateIssuerTypeConstraints(finalIssuerType, finalEnrollmentType, finalCaId ?? null, existingProfile.caId);

    // Validate external configs only if they are provided in the update
    if (data.externalConfigs !== undefined) {
      await validateExternalConfigs(
        data.externalConfigs,
        finalCaId ?? null,
        certificateAuthorityDAL,
        externalCertificateAuthorityDAL
      );
    }

    const updatedData =
      finalIssuerType === IssuerType.SELF_SIGNED && existingProfile.caId ? { ...data, caId: null } : data;

    const { estConfig, apiConfig, acmeConfig, ...profileUpdateData } = updatedData;

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

      if (acmeConfig && existingProfile.acmeConfigId) {
        await acmeEnrollmentConfigDAL.updateById(
          existingProfile.acmeConfigId,
          {
            skipDnsOwnershipVerification: acmeConfig.skipDnsOwnershipVerification ?? false
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: profile.slug
      })
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: profile.slug
      })
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
    if (profile.enrollmentType === EnrollmentType.ACME && profile.acmeConfig) {
      profile.acmeConfig.directoryUrl = buildUrl(profile.id, "/directory");
      if (profile.acmeConfig.encryptedEabSecret) {
        profile.acmeConfig.encryptedEabSecret = undefined;
      }
    }

    // Parse externalConfigs from JSON string to object if it exists
    let parsedExternalConfigs: Record<string, unknown> | null = null;
    if (profile.externalConfigs && typeof profile.externalConfigs === "string") {
      try {
        parsedExternalConfigs = JSON.parse(profile.externalConfigs) as Record<string, unknown>;
      } catch {
        // If parsing fails, leave as null
        parsedExternalConfigs = null;
      }
    } else if (profile.externalConfigs && typeof profile.externalConfigs === "object") {
      // Already an object, use as-is
      parsedExternalConfigs = profile.externalConfigs;
    }

    return {
      ...profile,
      enrollmentType: profile.enrollmentType as EnrollmentType,
      externalConfigs: parsedExternalConfigs
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug
      })
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
    issuerType,
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
    issuerType?: IssuerType;
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

    const processedRules = getProcessedPermissionRules(
      permission,
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    );

    const profiles = await certificateProfileDAL.findByProjectId(
      projectId,
      {
        offset,
        limit,
        search,
        enrollmentType,
        issuerType,
        caId
      },
      processedRules
    );

    const totalCount = await certificateProfileDAL.countByProjectId(
      projectId,
      {
        search,
        enrollmentType,
        issuerType,
        caId
      },
      processedRules
    );

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
          apiConfig: profileWithConfigs.apiConfig,
          acmeConfig: profileWithConfigs.acmeConfig
            ? { ...profileWithConfigs.acmeConfig, directoryUrl: buildUrl(profile.id, "/directory") }
            : undefined
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: profile.slug
      })
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: profile.slug
      })
    );

    const certificates = await certificateProfileDAL.getCertificatesByProfile(profileId, {
      offset,
      limit,
      status,
      search
    });

    return certificates;
  };

  const getLatestActiveCertificateBundle = async ({
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
  }) => {
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
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: profile.slug
      })
    );

    const cert = await certificateProfileDAL.getLatestActiveCertificateForProfile(profileId);

    if (!cert) {
      return null;
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber
      })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber
      })
    );

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId: cert.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKeyId
    });
    const decryptedCert = await kmsDecryptor({
      cipherTextBlob: certBody.encryptedCertificate
    });

    const certObj = new x509.X509Certificate(decryptedCert);
    const certificate = certObj.toString("pem");

    const decryptedCertChain = await kmsDecryptor({
      cipherTextBlob: certBody.encryptedCertificateChain!
    });

    const certificateChain = decryptedCertChain.toString();

    let privateKey = null;
    try {
      const { certPrivateKey } = await getCertificateCredentials({
        certId: cert.id,
        projectId: cert.projectId,
        certificateSecretDAL,
        projectDAL,
        kmsService
      });
      privateKey = certPrivateKey;
    } catch (error) {
      // Private key might not exist for ACME certificates or other external workflows
      // where the key is generated client-side
      if (error instanceof NotFoundError) {
        privateKey = null;
      } else {
        throw error;
      }
    }

    return {
      certificate,
      certificateChain,
      privateKey,
      profile,
      certObj: cert
    };
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
        subject(ProjectPermissionSub.CertificateProfiles, {
          slug: profile.slug
        })
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

  const revealAcmeEabSecret = async ({
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
  }) => {
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
      ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret,
      subject(ProjectPermissionSub.CertificateProfiles, {
        slug: profile.slug
      })
    );

    if (profile.enrollmentType !== EnrollmentType.ACME) {
      throw new ForbiddenRequestError({
        message: "Profile is not configured for ACME enrollment"
      });
    }
    if (!profile.acmeConfig) {
      throw new NotFoundError({ message: "ACME configuration not found for this profile" });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: profile.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const eabSecret = await kmsDecryptor({ cipherTextBlob: profile.acmeConfig.encryptedEabSecret! });
    return { eabKid: profile.id, eabSecret: eabSecret.toString("base64url") };
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
    getLatestActiveCertificateBundle,
    getEstConfigurationByProfile,
    revealAcmeEabSecret
  };
};
