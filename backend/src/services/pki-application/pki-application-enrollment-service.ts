import { ForbiddenError } from "@casl/ability";

import { ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionApplicationActions,
  ResourcePermissionApplicationEnrollmentActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import { generateAndEncryptScepRaCertificate, resolveScepRaSigning } from "@app/ee/services/pki-scep/pki-scep-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import {
  generateAndEncryptAcmeEabSecret,
  validateAndEncryptPemCaChain
} from "@app/services/certificate-profile/certificate-profile-service";
import { TAcmeEnrollmentConfigDALFactory } from "@app/services/enrollment-config/acme-enrollment-config-dal";
import { TApiEnrollmentConfigDALFactory } from "@app/services/enrollment-config/api-enrollment-config-dal";
import { TEstEnrollmentConfigDALFactory } from "@app/services/enrollment-config/est-enrollment-config-dal";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TPkiApplicationDALFactory } from "./pki-application-dal";
import { TPkiApplicationProfileDALFactory } from "./pki-application-profile-dal";

type TGetEnrollmentDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

type TSetApiEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  config: { autoRenew?: boolean; renewBeforeDays?: number };
} & TProjectPermission;

type TClearApiEnrollmentDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

type TSetEstEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  config: { passphrase: string; disableBootstrapCaValidation?: boolean; caChain?: string };
} & TProjectPermission;

type TSetAcmeEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  config: { skipDnsOwnershipVerification?: boolean; skipEabBinding?: boolean };
} & TProjectPermission;

type TSetScepEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  config: {
    challengeType?: ScepChallengeType;
    challengePassword?: string;
    includeCaCertInResponse?: boolean;
    allowCertBasedRenewal?: boolean;
    dynamicChallengeExpiryMinutes?: number;
    dynamicChallengeMaxPending?: number;
    validationConnectionId?: string;
    signRaWithCa?: boolean;
  };
} & TProjectPermission;

type TClearMethodEnrollmentDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

type TRevealEabSecretDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

type TPkiApplicationEnrollmentServiceFactoryDep = {
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  pkiApplicationProfileDAL: Pick<
    TPkiApplicationProfileDALFactory,
    "findOneByApplicationAndProfile" | "transaction" | "update"
  >;
  apiEnrollmentConfigDAL: Pick<TApiEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  estEnrollmentConfigDAL: Pick<TEstEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  acmeEnrollmentConfigDAL: Pick<TAcmeEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find">;
  hsmConnectorService: THsmConnectorServiceFactory;
  kmsService: Pick<
    TKmsServiceFactory,
    "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "createCipherPairWithDataKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
};

export type TPkiApplicationEnrollmentServiceFactory = ReturnType<typeof pkiApplicationEnrollmentServiceFactory>;

export const pkiApplicationEnrollmentServiceFactory = ({
  pkiApplicationDAL,
  pkiApplicationProfileDAL,
  apiEnrollmentConfigDAL,
  estEnrollmentConfigDAL,
  acmeEnrollmentConfigDAL,
  scepEnrollmentConfigDAL,
  appConnectionDAL,
  certificateProfileDAL,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCertDAL,
  hsmConnectorService,
  kmsService,
  projectDAL,
  permissionService
}: TPkiApplicationEnrollmentServiceFactoryDep) => {
  const $loadJunction = async (applicationId: string, profileId: string, projectId: string) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const junction = await pkiApplicationProfileDAL.findOneByApplicationAndProfile(applicationId, profileId);
    if (!junction) {
      throw new NotFoundError({
        message: `Profile '${profileId}' is not attached to application '${applicationId}'.`
      });
    }

    return { junction };
  };

  const $assertEditEnrollment = async (
    applicationId: string,
    profileId: string,
    projectId: string,
    actor: TProjectPermission["actor"],
    actorId: TProjectPermission["actorId"],
    actorAuthMethod: TProjectPermission["actorAuthMethod"],
    actorOrgId: TProjectPermission["actorOrgId"]
  ) => {
    const { junction } = await $loadJunction(applicationId, profileId, projectId);
    const { permission } = await permissionService.getResourcePermission({
      actor,
      actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Edit,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationEnrollmentActions.Edit,
      ResourcePermissionSub.ApplicationEnrollment
    );
    return { junction };
  };

  const getEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetEnrollmentDTO) => {
    const { junction } = await $loadJunction(applicationId, profileId, projectId);

    const { permission } = await permissionService.getResourcePermission({
      actor,
      actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationEnrollmentActions.Read,
      ResourcePermissionSub.ApplicationEnrollment
    );

    const apiConfig = junction.apiConfigId ? await apiEnrollmentConfigDAL.findById(junction.apiConfigId) : null;
    const acmeConfig = junction.acmeConfigId ? await acmeEnrollmentConfigDAL.findById(junction.acmeConfigId) : null;
    const estConfig = junction.estConfigId ? await estEnrollmentConfigDAL.findById(junction.estConfigId) : null;
    const scepConfig = junction.scepConfigId ? await scepEnrollmentConfigDAL.findById(junction.scepConfigId) : null;

    const profile = await certificateProfileDAL.findById(profileId);
    const { raCaSigningSupported, caType } = await resolveScepRaSigning({
      caId: profile?.caId,
      certificateAuthorityDAL
    });

    const siteUrl = getConfig().SITE_URL ?? "";
    const appProfilePath = `applications/${applicationId}/profiles/${profileId}`;

    return {
      applicationId,
      profileId,
      api: apiConfig
        ? {
            id: apiConfig.id,
            autoRenew: Boolean(apiConfig.autoRenew),
            renewBeforeDays: apiConfig.renewBeforeDays ?? null
          }
        : null,
      est: estConfig
        ? {
            id: estConfig.id,
            disableBootstrapCaValidation: Boolean(estConfig.disableBootstrapCaValidation),
            estEndpointUrl: `${siteUrl}/.well-known/est/${appProfilePath}`
          }
        : null,
      acme: acmeConfig
        ? {
            id: acmeConfig.id,
            skipDnsOwnershipVerification: Boolean(acmeConfig.skipDnsOwnershipVerification),
            skipEabBinding: Boolean(acmeConfig.skipEabBinding),
            directoryUrl: `${siteUrl}/api/v1/cert-manager/acme/${appProfilePath}/directory`
          }
        : null,
      scep: scepConfig
        ? {
            id: scepConfig.id,
            challengeType: scepConfig.challengeType as ScepChallengeType,
            includeCaCertInResponse: Boolean(scepConfig.includeCaCertInResponse),
            allowCertBasedRenewal: Boolean(scepConfig.allowCertBasedRenewal),
            dynamicChallengeExpiryMinutes: scepConfig.dynamicChallengeExpiryMinutes ?? null,
            dynamicChallengeMaxPending: scepConfig.dynamicChallengeMaxPending ?? null,
            scepEndpointUrl: `${siteUrl}/scep/${appProfilePath}/pkiclient.exe`,
            challengeEndpointUrl:
              scepConfig.challengeType === ScepChallengeType.DYNAMIC
                ? `${siteUrl}/scep/${appProfilePath}/challenge`
                : null,
            raCertificatePem: scepConfig.raCertificate,
            raCertExpiresAt: scepConfig.raCertExpiresAt,
            validationConnectionId: scepConfig.validationConnectionId ?? null,
            signRaWithCa: Boolean(scepConfig.signRaWithCa)
          }
        : null,
      raCaSigningSupported,
      caType,
      estConfigured: Boolean(junction.estConfigId),
      acmeConfigured: Boolean(junction.acmeConfigId),
      scepConfigured: Boolean(junction.scepConfigId)
    };
  };

  const setApiEnrollment = async ({
    applicationId,
    profileId,
    config,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSetApiEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    if (config.autoRenew && (config.renewBeforeDays === undefined || config.renewBeforeDays === null)) {
      throw new BadRequestError({ message: "renewBeforeDays is required when autoRenew is true." });
    }

    return pkiApplicationProfileDAL.transaction(async (tx) => {
      let { apiConfigId } = junction;

      if (apiConfigId) {
        await apiEnrollmentConfigDAL.updateById(
          apiConfigId,
          {
            autoRenew: config.autoRenew ?? false,
            renewBeforeDays: config.renewBeforeDays ?? null
          },
          tx
        );
      } else {
        const created = await apiEnrollmentConfigDAL.create(
          {
            autoRenew: config.autoRenew ?? false,
            renewBeforeDays: config.renewBeforeDays ?? null,
            applicationProfileId: junction.id
          },
          tx
        );
        apiConfigId = created.id;
        await pkiApplicationProfileDAL.update({ applicationId, profileId }, { apiConfigId }, tx);
      }

      const apiConfig = await apiEnrollmentConfigDAL.findById(apiConfigId, tx);
      if (!apiConfig) {
        throw new NotFoundError({ message: "API enrollment config not found after upsert." });
      }
      return {
        applicationId,
        profileId,
        api: {
          id: apiConfig.id,
          autoRenew: Boolean(apiConfig.autoRenew),
          renewBeforeDays: (apiConfig.renewBeforeDays as number | null) ?? null
        }
      };
    });
  };

  const clearApiEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TClearApiEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    if (!junction.apiConfigId) {
      return { applicationId, profileId };
    }

    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { apiConfigId: null }, tx);
      await apiEnrollmentConfigDAL.deleteById(junction.apiConfigId as string, tx);
    });

    return { applicationId, profileId };
  };

  const setEstEnrollment = async ({
    applicationId,
    profileId,
    config,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSetEstEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    if (!config.passphrase || config.passphrase.length < 8) {
      throw new BadRequestError({ message: "EST passphrase must be at least 8 characters." });
    }

    const appCfg = getConfig();
    const hashedPassphrase = await crypto.hashing().createHash(config.passphrase, appCfg.SALT_ROUNDS);

    const caChainProvided = typeof config.caChain === "string" && config.caChain.length > 0;
    let encryptedCaChain: Buffer | null = null;
    if (!config.disableBootstrapCaValidation && caChainProvided) {
      const result = await validateAndEncryptPemCaChain(config.caChain as string, projectId, kmsService, projectDAL);
      encryptedCaChain = result.encryptedCaChain;
    }

    return pkiApplicationProfileDAL.transaction(async (tx) => {
      let { estConfigId } = junction;
      if (estConfigId) {
        await estEnrollmentConfigDAL.updateById(
          estConfigId,
          {
            disableBootstrapCaValidation: config.disableBootstrapCaValidation ?? false,
            hashedPassphrase,
            ...(caChainProvided ? { encryptedCaChain } : {})
          },
          tx
        );
      } else {
        const created = await estEnrollmentConfigDAL.create(
          {
            disableBootstrapCaValidation: config.disableBootstrapCaValidation ?? false,
            hashedPassphrase,
            encryptedCaChain,
            applicationProfileId: junction.id
          },
          tx
        );
        estConfigId = created.id;
        await pkiApplicationProfileDAL.update({ applicationId, profileId }, { estConfigId }, tx);
      }
      return {
        applicationId,
        profileId,
        est: { id: estConfigId, disableBootstrapCaValidation: config.disableBootstrapCaValidation ?? false }
      };
    });
  };

  const clearEstEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TClearMethodEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.estConfigId) return { applicationId, profileId };
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { estConfigId: null }, tx);
      await estEnrollmentConfigDAL.deleteById(junction.estConfigId as string, tx);
    });
    return { applicationId, profileId };
  };

  const setAcmeEnrollment = async ({
    applicationId,
    profileId,
    config,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSetAcmeEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    if (config.skipDnsOwnershipVerification && config.skipEabBinding) {
      throw new BadRequestError({
        message: "skipDnsOwnershipVerification and skipEabBinding cannot both be enabled — pick at most one."
      });
    }

    return pkiApplicationProfileDAL.transaction(async (tx) => {
      let { acmeConfigId } = junction;
      if (acmeConfigId) {
        await acmeEnrollmentConfigDAL.updateById(
          acmeConfigId,
          {
            skipDnsOwnershipVerification: config.skipDnsOwnershipVerification ?? false,
            skipEabBinding: config.skipEabBinding ?? false
          },
          tx
        );
      } else {
        const { encryptedEabSecret } = await generateAndEncryptAcmeEabSecret(projectId, kmsService, projectDAL);
        const created = await acmeEnrollmentConfigDAL.create(
          {
            skipDnsOwnershipVerification: config.skipDnsOwnershipVerification ?? false,
            skipEabBinding: config.skipEabBinding ?? false,
            encryptedEabSecret,
            applicationProfileId: junction.id
          },
          tx
        );
        acmeConfigId = created.id;
        await pkiApplicationProfileDAL.update({ applicationId, profileId }, { acmeConfigId }, tx);
      }
      return {
        applicationId,
        profileId,
        acme: {
          id: acmeConfigId,
          skipDnsOwnershipVerification: config.skipDnsOwnershipVerification ?? false,
          skipEabBinding: config.skipEabBinding ?? false
        }
      };
    });
  };

  const clearAcmeEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TClearMethodEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.acmeConfigId) return { applicationId, profileId };
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { acmeConfigId: null }, tx);
      await acmeEnrollmentConfigDAL.deleteById(junction.acmeConfigId as string, tx);
    });
    return { applicationId, profileId };
  };

  const revealAcmeEabSecret = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRevealEabSecretDTO) => {
    const { junction } = await $loadJunction(applicationId, profileId, projectId);
    const { permission } = await permissionService.getResourcePermission({
      actor,
      actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Read,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationEnrollmentActions.RevealAcmeEabSecret,
      ResourcePermissionSub.ApplicationEnrollment
    );

    if (!junction.acmeConfigId) {
      throw new NotFoundError({ message: "ACME enrollment is not configured for this profile." });
    }
    const acmeConfig = await acmeEnrollmentConfigDAL.findById(junction.acmeConfigId);
    if (!acmeConfig?.encryptedEabSecret) {
      throw new NotFoundError({ message: "ACME EAB secret is not available." });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
    const eabSecret = await kmsDecryptor({ cipherTextBlob: acmeConfig.encryptedEabSecret });

    return {
      applicationId,
      profileId,
      eabKid: acmeConfig.id,
      eabSecret: eabSecret.toString("base64url")
    };
  };

  const rotateAcmeEabSecret = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRevealEabSecretDTO) => {
    const { junction } = await $loadJunction(applicationId, profileId, projectId);
    const { permission } = await permissionService.getResourcePermission({
      actor,
      actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: applicationId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationActions.Edit,
      ResourcePermissionSub.Application
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionApplicationEnrollmentActions.RotateAcmeEabSecret,
      ResourcePermissionSub.ApplicationEnrollment
    );

    if (!junction.acmeConfigId) {
      throw new NotFoundError({ message: "ACME enrollment is not configured for this profile." });
    }
    const { encryptedEabSecret } = await generateAndEncryptAcmeEabSecret(projectId, kmsService, projectDAL);
    await acmeEnrollmentConfigDAL.updateById(junction.acmeConfigId, { encryptedEabSecret });
    return { applicationId, profileId };
  };

  const setScepEnrollment = async ({
    applicationId,
    profileId,
    config,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSetScepEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    const challengeType = config.challengeType ?? ScepChallengeType.STATIC;
    const isIntune = challengeType === ScepChallengeType.MICROSOFT_INTUNE;
    const appCfg = getConfig();

    let validationConnectionId: string | null = null;
    let validationConnectionName: string | null = null;
    if (isIntune) {
      if (!config.validationConnectionId) {
        throw new BadRequestError({
          message: "A Microsoft Intune connection is required for Microsoft Intune SCEP validation."
        });
      }
      const connection = await appConnectionDAL.findById(config.validationConnectionId);
      if (!connection || connection.orgId !== actorOrgId || connection.app !== AppConnection.MicrosoftIntune) {
        throw new BadRequestError({ message: "The selected Microsoft Intune connection could not be found." });
      }
      validationConnectionId = connection.id;
      validationConnectionName = connection.name;
    }

    let hashedChallengePassword: string | null = null;
    if (challengeType === ScepChallengeType.STATIC) {
      if (!config.challengePassword) {
        throw new BadRequestError({ message: "challengePassword is required for static SCEP challenges." });
      }
      hashedChallengePassword = await crypto.hashing().createHash(config.challengePassword, appCfg.SALT_ROUNDS);
    }

    // Cert-based renewal skips the challenge, which would bypass Intune's per-request validation, so force it off.
    const allowCertBasedRenewal = isIntune ? false : (config.allowCertBasedRenewal ?? true);

    const isFirstCreate = !junction.scepConfigId;
    const raSlug = `app-${applicationId}-${profileId}`;

    const profile = await certificateProfileDAL.findById(profileId);
    const { signRaWithCa } = await resolveScepRaSigning({
      caId: profile?.caId,
      requestedSignRaWithCa: config.signRaWithCa,
      certificateAuthorityDAL
    });

    const existingScepConfig = junction.scepConfigId
      ? await scepEnrollmentConfigDAL.findById(junction.scepConfigId)
      : null;
    // Regenerating the RA breaks devices already trusting it, so only do it on first enable or a signing change.
    const shouldGenerateRaCert =
      isFirstCreate || (existingScepConfig ? existingScepConfig.signRaWithCa !== signRaWithCa : false);
    let raCert: Awaited<ReturnType<typeof generateAndEncryptScepRaCertificate>> | null = null;
    if (shouldGenerateRaCert) {
      raCert = await generateAndEncryptScepRaCertificate({
        slug: raSlug,
        caId: profile?.caId,
        signRaWithCa,
        projectId,
        deps: {
          certificateAuthorityDAL,
          certificateAuthoritySecretDAL,
          certificateAuthorityCertDAL,
          projectDAL,
          kmsService,
          hsmConnectorService
        }
      });
    }

    return pkiApplicationProfileDAL.transaction(async (tx) => {
      let { scepConfigId } = junction;
      const dynamicChallengeExpiryMinutes =
        challengeType === ScepChallengeType.DYNAMIC ? (config.dynamicChallengeExpiryMinutes ?? 60) : null;
      const dynamicChallengeMaxPending =
        challengeType === ScepChallengeType.DYNAMIC ? (config.dynamicChallengeMaxPending ?? 100) : null;

      if (scepConfigId) {
        await scepEnrollmentConfigDAL.updateById(
          scepConfigId,
          {
            ...(hashedChallengePassword !== null ? { hashedChallengePassword } : {}),
            ...(raCert
              ? {
                  raCertificate: raCert.certificatePem,
                  raCertExpiresAt: raCert.expiresAt,
                  encryptedRaPrivateKey: raCert.encryptedPrivateKey
                }
              : {}),
            challengeType,
            includeCaCertInResponse: config.includeCaCertInResponse ?? true,
            allowCertBasedRenewal,
            signRaWithCa,
            dynamicChallengeExpiryMinutes,
            dynamicChallengeMaxPending,
            validationConnectionId
          },
          tx
        );
      } else {
        if (!raCert) {
          // Defensive, should never hit; raCert is generated when isFirstCreate.
          throw new BadRequestError({ message: "Failed to generate SCEP RA certificate." });
        }
        const created = await scepEnrollmentConfigDAL.create(
          {
            encryptedRaPrivateKey: raCert.encryptedPrivateKey,
            raCertificate: raCert.certificatePem,
            raCertExpiresAt: raCert.expiresAt,
            hashedChallengePassword,
            challengeType,
            includeCaCertInResponse: config.includeCaCertInResponse ?? true,
            allowCertBasedRenewal,
            signRaWithCa,
            dynamicChallengeExpiryMinutes,
            dynamicChallengeMaxPending,
            validationConnectionId,
            applicationProfileId: junction.id
          },
          tx
        );
        scepConfigId = created.id;
        await pkiApplicationProfileDAL.update({ applicationId, profileId }, { scepConfigId }, tx);
      }
      return {
        applicationId,
        profileId,
        scep: { id: scepConfigId, challengeType },
        signRaWithCa,
        validationConnection: validationConnectionId
          ? { id: validationConnectionId, name: validationConnectionName }
          : null
      };
    });
  };

  const clearScepEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TClearMethodEnrollmentDTO) => {
    const { junction } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.scepConfigId) return { applicationId, profileId };
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { scepConfigId: null }, tx);
      await scepEnrollmentConfigDAL.deleteById(junction.scepConfigId as string, tx);
    });
    return { applicationId, profileId };
  };

  return {
    getEnrollment,
    setApiEnrollment,
    clearApiEnrollment,
    setEstEnrollment,
    clearEstEnrollment,
    setAcmeEnrollment,
    clearAcmeEnrollment,
    revealAcmeEabSecret,
    rotateAcmeEabSecret,
    setScepEnrollment,
    clearScepEnrollment
  };
};
