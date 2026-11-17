import { ForbiddenError } from "@casl/ability";

import { ResourceType, TPkiMicrosoftAutoenrollmentConfigs } from "@app/db/schemas";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import {
  assertProfileCaSupportsMicrosoftAutoenrollment,
  buildPolicyUrl,
  mergeAllowedGroupNames,
  readUploadedKeytab,
  resolveAllowedGroupNames,
  resolveInstanceServicePrincipalName
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-fns";
import {
  buildPolicyId,
  buildTemplateOid
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-template-fns";
import { MicrosoftAutoenrollmentKeytabSource } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionApplicationActions,
  ResourcePermissionApplicationEnrollmentActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import {
  generateAndEncryptScepRaCertificate,
  resolveCaType,
  resolveScepRaSigning
} from "@app/ee/services/pki-scep/pki-scep-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TProjectPermission } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TLdapConnectionConfig } from "@app/services/app-connection/ldap/ldap-connection-types";
import {
  assertLdapProviderIsSupported,
  resolveDirectorySidNames,
  searchDirectoryGroups
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import { TCertRequestPolicy } from "@app/services/approval-policy/cert-request/cert-request-policy-types";
import type { TCaKeySourceServiceFactory } from "@app/services/certificate-authority/ca-key-source/ca-key-source-service";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CERTIFICATE_AUTHORITIES_TYPE_MAP } from "@app/services/certificate-authority/certificate-authority-maps";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import {
  generateAndEncryptAcmeEabSecret,
  validateAndEncryptPemCaChain
} from "@app/services/certificate-profile/certificate-profile-service";
import { TCertificateProfileDefaults } from "@app/services/certificate-profile/certificate-profile-types";
import { TAcmeEnrollmentConfigDALFactory } from "@app/services/enrollment-config/acme-enrollment-config-dal";
import { TApiEnrollmentConfigDALFactory } from "@app/services/enrollment-config/api-enrollment-config-dal";
import { TEstEnrollmentConfigDALFactory } from "@app/services/enrollment-config/est-enrollment-config-dal";
import { TMicrosoftAutoenrollmentEnrollmentConfigDALFactory } from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
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
  actorRootOrgId: string;
  actorParentOrgId: string;
} & TProjectPermission;

type TClearMethodEnrollmentDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

type TRevealEabSecretDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

type TSetMicrosoftAutoenrollmentEnrollmentDTO = {
  applicationId: string;
  profileId: string;
  config: {
    connectionId?: string;
    allowedGroupSids?: string[] | null;
    renewBeforeDays?: number;
    keytab?: string;
    reuseKeytab?: { servicePrincipalName: string; keyVersion: number };
  };
  actorRootOrgId: string;
  actorParentOrgId: string;
} & TProjectPermission;

type TListMicrosoftAutoenrollmentGroupsDTO = {
  applicationId: string;
  profileId: string;
  connectionId: string;
  search?: string;
  actorRootOrgId: string;
  actorParentOrgId: string;
} & TProjectPermission;

type TGetMicrosoftAutoenrollmentServicePrincipalDTO = {
  applicationId: string;
  profileId: string;
} & TProjectPermission;

const MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS = 42;

const sortedSids = (sids: string[] | null | undefined) => [...(sids ?? [])].sort().join(",");

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
  microsoftAutoenrollmentEnrollmentConfigDAL: Pick<
    TMicrosoftAutoenrollmentEnrollmentConfigDALFactory,
    "create" | "update" | "updateById" | "deleteById" | "findById" | "findByApplicationId"
  >;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  licenseService: TLicenseService;
  approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "matchPolicy">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find">;
  caKeySourceService: Pick<TCaKeySourceServiceFactory, "buildSigner">;
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
  microsoftAutoenrollmentEnrollmentConfigDAL,
  appConnectionService,
  appConnectionDAL,
  gatewayV2Service,
  gatewayPoolService,
  licenseService,
  approvalPolicyService,
  certificateProfileDAL,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCertDAL,
  caKeySourceService,
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

    return { junction, application };
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
    const { junction, application } = await $loadJunction(applicationId, profileId, projectId);
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
    return { junction, application };
  };

  const $assertReadEnrollment = async (
    applicationId: string,
    profileId: string,
    projectId: string,
    actor: TProjectPermission["actor"],
    actorId: TProjectPermission["actorId"],
    actorAuthMethod: TProjectPermission["actorAuthMethod"],
    actorOrgId: TProjectPermission["actorOrgId"]
  ) => {
    const { junction, application } = await $loadJunction(applicationId, profileId, projectId);
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
    return { junction, application };
  };

  const $buildMicrosoftAutoenrollmentState = ({
    applicationId,
    profileId,
    applicationProfileId,
    profileName,
    config
  }: {
    applicationId: string;
    profileId: string;
    applicationProfileId: string;
    profileName: string;
    config: TPkiMicrosoftAutoenrollmentConfigs;
  }) => ({
    policyUrl: buildPolicyUrl(applicationId, profileId),
    policyId: buildPolicyId(applicationProfileId),
    templateName: profileName,
    templateOid: buildTemplateOid(applicationProfileId),
    allowedGroups: (config.allowedGroupSids ?? []).map((sid) => ({
      sid,
      name: (config.allowedGroupNames as Record<string, string | null> | null)?.[sid] ?? null
    })),
    renewBeforeDays: config.renewBeforeDays,
    servicePrincipalName: config.servicePrincipalName,
    keyVersion: config.keyVersion,
    connectionId: config.appConnectionId,
    keytabMismatch:
      config.mismatchedServicePrincipalName && config.mismatchFirstSeenAt
        ? {
            servicePrincipalName: config.mismatchedServicePrincipalName,
            firstSeenAt: config.mismatchFirstSeenAt,
            requestCount: config.mismatchRequestCount
          }
        : null
  });

  const getEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetEnrollmentDTO) => {
    const { junction, application } = await $assertReadEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    const apiConfig = junction.apiConfigId ? await apiEnrollmentConfigDAL.findById(junction.apiConfigId) : null;
    const acmeConfig = junction.acmeConfigId ? await acmeEnrollmentConfigDAL.findById(junction.acmeConfigId) : null;
    const estConfig = junction.estConfigId ? await estEnrollmentConfigDAL.findById(junction.estConfigId) : null;
    const scepConfig = junction.scepConfigId ? await scepEnrollmentConfigDAL.findById(junction.scepConfigId) : null;

    const profile = await certificateProfileDAL.findById(profileId);
    const caType = await resolveCaType(profile?.caId, certificateAuthorityDAL);

    const microsoftAutoenrollmentConfigs =
      await microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId(applicationId);
    const microsoftAutoenrollmentConfig = microsoftAutoenrollmentConfigs.find(
      (config) => config.id === junction.microsoftAutoenrollmentConfigId
    );

    const siteUrl = getConfig().SITE_URL ?? "";
    const appProfilePath = `applications/${applicationId}/profiles/${profileId}`;

    return {
      applicationId,
      applicationName: application.name,
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
      microsoftAutoenrollment: microsoftAutoenrollmentConfig
        ? $buildMicrosoftAutoenrollmentState({
            applicationId,
            profileId,
            applicationProfileId: junction.id,
            profileName: microsoftAutoenrollmentConfig.profileName,
            config: microsoftAutoenrollmentConfig
          })
        : null,
      microsoftAutoenrollmentOtherProfiles: microsoftAutoenrollmentConfigs
        .filter((config) => config.profileId !== profileId)
        .map((config) => ({
          profileId: config.profileId,
          profileName: config.profileName,
          servicePrincipalName: config.servicePrincipalName,
          keyVersion: config.keyVersion,
          connectionId: config.appConnectionId
        })),
      caType,
      estConfigured: Boolean(junction.estConfigId),
      acmeConfigured: Boolean(junction.acmeConfigId),
      scepConfigured: Boolean(junction.scepConfigId),
      microsoftAutoenrollmentConfigured: Boolean(junction.microsoftAutoenrollmentConfigId)
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
    const { junction, application } = await $assertEditEnrollment(
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
        applicationName: application.name,
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
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    if (!junction.apiConfigId) {
      return { applicationId, applicationName: application.name, profileId };
    }

    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { apiConfigId: null }, tx);
      await apiEnrollmentConfigDAL.deleteById(junction.apiConfigId as string, tx);
    });

    return { applicationId, applicationName: application.name, profileId };
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
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    // Runtime enrollment is already gated in the EST service, so this only moves the refusal to where
    // an admin can act on it instead of surfacing as a device that silently fails to enroll.
    const estPlan = await licenseService.getPlan(actorOrgId);
    if (!estPlan.has(PlanFeature.PkiEst)) {
      throw new BadRequestError({
        message: "Failed to enable EST enrollment due to plan restriction. Upgrade plan to use EST."
      });
    }

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
        applicationName: application.name,
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
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.estConfigId) return { applicationId, applicationName: application.name, profileId };
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { estConfigId: null }, tx);
      await estEnrollmentConfigDAL.deleteById(junction.estConfigId as string, tx);
    });
    return { applicationId, applicationName: application.name, profileId };
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
    const { junction, application } = await $assertEditEnrollment(
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
        applicationName: application.name,
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
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.acmeConfigId) return { applicationId, applicationName: application.name, profileId };
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { acmeConfigId: null }, tx);
      await acmeEnrollmentConfigDAL.deleteById(junction.acmeConfigId as string, tx);
    });
    return { applicationId, applicationName: application.name, profileId };
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
    const { junction, application } = await $loadJunction(applicationId, profileId, projectId);
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
      applicationName: application.name,
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
    const { junction, application } = await $loadJunction(applicationId, profileId, projectId);
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
    return { applicationId, applicationName: application.name, profileId };
  };

  const setScepEnrollment = async ({
    applicationId,
    profileId,
    config,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    actorRootOrgId,
    actorParentOrgId
  }: TSetScepEnrollmentDTO) => {
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    const scepPlan = await licenseService.getPlan(actorOrgId);
    if (!scepPlan.has(PlanFeature.PkiScep)) {
      throw new BadRequestError({
        message: "Failed to enable SCEP enrollment due to plan restriction. Upgrade plan to use SCEP."
      });
    }

    const challengeType = config.challengeType ?? ScepChallengeType.STATIC;
    const isIntune = challengeType === ScepChallengeType.MICROSOFT_INTUNE;
    const appCfg = getConfig();

    // Cert-based renewal skips the challenge, which would bypass Intune's per-request validation.
    if (isIntune && config.allowCertBasedRenewal === true) {
      throw new BadRequestError({
        message:
          "Certificate-based renewal cannot be enabled with Microsoft Intune validation, because renewals would skip Intune's per-request validation."
      });
    }
    const allowCertBasedRenewal = isIntune ? false : (config.allowCertBasedRenewal ?? true);

    let validationConnectionId: string | null = null;
    let validationConnectionName: string | null = null;
    if (isIntune) {
      if (!config.validationConnectionId) {
        throw new BadRequestError({
          message: "A Microsoft Intune connection is required for Microsoft Intune SCEP validation."
        });
      }
      const connection = await appConnectionService.validateAppConnectionUsageById(
        AppConnection.MicrosoftIntune,
        { connectionId: config.validationConnectionId, projectId },
        {
          id: actorId,
          type: actor,
          orgId: actorOrgId,
          authMethod: actorAuthMethod,
          rootOrgId: actorRootOrgId,
          parentOrgId: actorParentOrgId
        }
      );
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

    const isFirstCreate = !junction.scepConfigId;
    const raSlug = `app-${applicationId}-${profileId}`;

    const profile = await certificateProfileDAL.findById(profileId);
    const caType = await resolveCaType(profile?.caId, certificateAuthorityDAL);

    // External CAs always issue asynchronously and Intune has no pending state, so every enrollment
    // would be reported to Intune as a failure.
    if (isIntune && caType !== CaType.INTERNAL) {
      throw new BadRequestError({
        message: `Microsoft Intune validation requires an internal certificate authority. This profile uses ${CERTIFICATE_AUTHORITIES_TYPE_MAP[caType]}, which issues asynchronously and cannot complete within a SCEP request.`
      });
    }

    if (isIntune && profile) {
      const matchedApprovalPolicy = (await approvalPolicyService.matchPolicy(
        ApprovalPolicyType.CertRequest,
        projectId,
        {
          profileName: profile.slug,
          applicationId
        }
      )) as TCertRequestPolicy | null;

      if (matchedApprovalPolicy) {
        throw new BadRequestError({
          message: `Microsoft Intune validation cannot be used on this profile because the certificate request approval policy '${matchedApprovalPolicy.name}' applies to it. Requests that require approval cannot complete within a SCEP request. Remove this profile from the policy, or use a static or dynamic SCEP challenge instead.`
        });
      }
    }

    const { signRaWithCa } = await resolveScepRaSigning({
      caId: profile?.caId,
      requestedSignRaWithCa: config.signRaWithCa,
      certificateAuthorityDAL
    });

    const existingScepConfig = junction.scepConfigId
      ? await scepEnrollmentConfigDAL.findById(junction.scepConfigId)
      : null;

    if (isIntune && !signRaWithCa) {
      throw new BadRequestError({
        message:
          "Microsoft Intune validation requires the RA certificate to be signed with the CA. Enable 'Sign RA certificate with the CA' on this SCEP enrollment."
      });
    }

    // Changing this regenerates the RA certificate, which breaks devices already trusting the current one.
    if (existingScepConfig && existingScepConfig.signRaWithCa !== signRaWithCa) {
      throw new BadRequestError({
        message:
          "Signing the RA certificate with the CA cannot be changed for an existing SCEP enrollment. Disable SCEP enrollment and set it up again to change it."
      });
    }

    let raCert: Awaited<ReturnType<typeof generateAndEncryptScepRaCertificate>> | null = null;
    if (isFirstCreate) {
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
          caKeySourceService
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
        applicationName: application.name,
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
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.scepConfigId) return { applicationId, applicationName: application.name, profileId };
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ applicationId, profileId }, { scepConfigId: null }, tx);
      await scepEnrollmentConfigDAL.deleteById(junction.scepConfigId as string, tx);
    });
    return { applicationId, applicationName: application.name, profileId };
  };

  const $withActiveDirectoryErrors =
    (connection: { id: string; name: string }) =>
    (err: unknown): never => {
      if (err instanceof BadRequestError) throw err;
      logger.warn({ err }, `Unable to search Active Directory [connectionId=${connection.id}]`);
      throw new BadRequestError({
        message: `Could not search Active Directory with the LDAP connection '${connection.name}'. Check that the directory is reachable and the connection's credentials are valid.`
      });
    };

  const $searchMicrosoftAutoenrollmentGroups = (connection: { id: string; name: string }, search?: string) =>
    searchDirectoryGroups(
      { config: connection as unknown as TLdapConnectionConfig, search },
      { gatewayV2Service, gatewayPoolService }
    ).catch($withActiveDirectoryErrors(connection));

  const $resolveNewConnectionGroupNames = async (
    connection: { id: string; name: string },
    allowedGroupSids: string[]
  ): Promise<Record<string, string | null>> => {
    if (!allowedGroupSids.length) {
      await $searchMicrosoftAutoenrollmentGroups(connection);
      return {};
    }
    return resolveDirectorySidNames(
      { config: connection as unknown as TLdapConnectionConfig, sids: allowedGroupSids },
      { gatewayV2Service, gatewayPoolService }
    ).catch($withActiveDirectoryErrors(connection));
  };

  const $resolveMicrosoftAutoenrollmentConnection = async ({
    connectionId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    actorRootOrgId,
    actorParentOrgId
  }: Omit<TListMicrosoftAutoenrollmentGroupsDTO, "applicationId" | "profileId" | "search">) => {
    const connection = await appConnectionService.validateAppConnectionUsageById(
      AppConnection.LDAP,
      { connectionId, projectId },
      {
        id: actorId,
        type: actor,
        orgId: actorOrgId,
        authMethod: actorAuthMethod,
        rootOrgId: actorRootOrgId,
        parentOrgId: actorParentOrgId
      }
    );
    assertLdapProviderIsSupported(
      (connection.credentials as { provider?: string } | undefined)?.provider,
      connection.name,
      "Microsoft Autoenrollment looks computers up by their security identifier in Active Directory, so it requires an Active Directory connection."
    );
    return connection;
  };

  const $encryptKeytab = async (certificateManagerKmsId: string, keytabFile: Buffer) => {
    const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
    return kmsEncryptor({ plainText: keytabFile });
  };

  const $resolveMicrosoftAutoenrollmentKeytab = async ({
    applicationId,
    applicationName,
    profileId,
    projectId,
    keytab,
    reuseKeytab
  }: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    projectId: string;
    keytab?: string;
    reuseKeytab?: { servicePrincipalName: string; keyVersion: number };
  }) => {
    if (keytab) {
      const keytabFile = Buffer.from(keytab, "base64");
      const { servicePrincipalName, keyVersion } = readUploadedKeytab(keytabFile);
      const certificateManagerKmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
      const { cipherTextBlob } = await $encryptKeytab(certificateManagerKmsId, keytabFile);
      return {
        source: MicrosoftAutoenrollmentKeytabSource.Uploaded,
        encryptedKeytab: cipherTextBlob,
        servicePrincipalName,
        keyVersion,
        reusedFromProfileId: undefined,
        reusedFromProfileName: undefined
      };
    }

    if (reuseKeytab) {
      const configs = await microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId(applicationId);
      const source = configs.find(
        (config) =>
          config.profileId !== profileId &&
          config.servicePrincipalName === reuseKeytab.servicePrincipalName &&
          config.keyVersion === reuseKeytab.keyVersion
      );
      if (!source) {
        throw new BadRequestError({
          message: `No other profile in application '${applicationName}' has a keytab for '${reuseKeytab.servicePrincipalName}' with key version ${reuseKeytab.keyVersion}. Upload the keytab file instead.`
        });
      }
      const certificateManagerKmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
      const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
      const { cipherTextBlob } = await $encryptKeytab(
        certificateManagerKmsId,
        await kmsDecryptor({ cipherTextBlob: source.encryptedKeytab })
      );
      return {
        source: MicrosoftAutoenrollmentKeytabSource.Reused,
        encryptedKeytab: cipherTextBlob,
        servicePrincipalName: source.servicePrincipalName,
        keyVersion: source.keyVersion,
        reusedFromProfileId: source.profileId,
        reusedFromProfileName: source.profileName
      };
    }

    return null;
  };

  const setMicrosoftAutoenrollmentEnrollment = async ({
    applicationId,
    profileId,
    config,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    actorRootOrgId,
    actorParentOrgId
  }: TSetMicrosoftAutoenrollmentEnrollmentDTO) => {
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );

    const plan = await licenseService.getPlan(actorOrgId);
    plan.assert(PlanFeature.PkiMicrosoftAutoenrollment);

    const existingConfig = junction.microsoftAutoenrollmentConfigId
      ? await microsoftAutoenrollmentEnrollmentConfigDAL.findById(junction.microsoftAutoenrollmentConfigId)
      : null;

    if (config.keytab && config.reuseKeytab) {
      throw new BadRequestError({ message: "Send either keytab or reuseKeytab, not both." });
    }

    const duplicateGroupSid = config.allowedGroupSids?.find((sid, index, sids) => sids.indexOf(sid) !== index);
    if (duplicateGroupSid) {
      throw new BadRequestError({
        message: `The allowed group '${duplicateGroupSid}' is listed more than once. List each group once.`
      });
    }

    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) throw new NotFoundError({ message: `Certificate profile with ID '${profileId}' not found` });
    await assertProfileCaSupportsMicrosoftAutoenrollment(
      {
        profileSlug: profile.slug,
        caId: profile.caId,
        keyAlgorithm: (profile.defaults as TCertificateProfileDefaults | null)?.keyAlgorithm
      },
      certificateAuthorityDAL
    );

    const connection = config.connectionId
      ? await $resolveMicrosoftAutoenrollmentConnection({
          connectionId: config.connectionId,
          projectId,
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId,
          actorRootOrgId,
          actorParentOrgId
        })
      : existingConfig && (await appConnectionDAL.findById(existingConfig.appConnectionId));
    if (!connection) {
      throw new BadRequestError({
        message:
          "Select the LDAP connection used to look up computers in Active Directory to turn on Microsoft Autoenrollment."
      });
    }

    const allowedGroupSids =
      config.allowedGroupSids === undefined ? (existingConfig?.allowedGroupSids ?? null) : config.allowedGroupSids;
    const isConnectionChanged = connection.id !== existingConfig?.appConnectionId;
    const newConnectionGroupNames = isConnectionChanged
      ? await $resolveNewConnectionGroupNames(connection, allowedGroupSids ?? [])
      : undefined;

    const newKeytab = await $resolveMicrosoftAutoenrollmentKeytab({
      applicationId,
      applicationName: application.name,
      profileId,
      projectId,
      keytab: config.keytab,
      reuseKeytab: config.reuseKeytab
    });
    const keytab = newKeytab ?? existingConfig;
    if (!keytab) {
      throw new BadRequestError({
        message:
          "Upload a keytab, or reuse the keytab of another profile in this application, to turn on Microsoft Autoenrollment."
      });
    }

    const configFields = {
      encryptedKeytab: keytab.encryptedKeytab,
      servicePrincipalName: keytab.servicePrincipalName,
      keyVersion: keytab.keyVersion,
      appConnectionId: connection.id,
      allowedGroupSids,
      renewBeforeDays:
        config.renewBeforeDays ?? existingConfig?.renewBeforeDays ?? MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS,
      ...(newKeytab && { mismatchedServicePrincipalName: null, mismatchFirstSeenAt: null, mismatchRequestCount: 0 })
    };
    const isAllowedGroupsChanged =
      isConnectionChanged || sortedSids(allowedGroupSids) !== sortedSids(existingConfig?.allowedGroupSids);
    const isConfigChanged =
      Boolean(newKeytab) || isAllowedGroupsChanged || configFields.renewBeforeDays !== existingConfig?.renewBeforeDays;
    const storedGroupNames = (existingConfig?.allowedGroupNames ?? {}) as Record<string, string | null>;
    let allowedGroupNames: Record<string, string | null> | undefined;
    if (newConnectionGroupNames) {
      allowedGroupNames = mergeAllowedGroupNames(allowedGroupSids ?? [], newConnectionGroupNames, storedGroupNames);
    } else if (isAllowedGroupsChanged) {
      allowedGroupNames = await resolveAllowedGroupNames(
        {
          allowedGroupSids: allowedGroupSids ?? [],
          appConnectionId: connection.id,
          storedNames: storedGroupNames
        },
        { appConnectionDAL, kmsService, gatewayV2Service, gatewayPoolService }
      );
    }

    const savedConfig = await pkiApplicationProfileDAL.transaction(async (tx) => {
      if (existingConfig) {
        return isConfigChanged
          ? microsoftAutoenrollmentEnrollmentConfigDAL.updateById(
              existingConfig.id,
              { ...configFields, ...(allowedGroupNames && { allowedGroupNames }), $incr: { templateMinorRevision: 1 } },
              tx
            )
          : existingConfig;
      }

      const created = await microsoftAutoenrollmentEnrollmentConfigDAL.create(
        { ...configFields, allowedGroupNames, applicationProfileId: junction.id },
        tx
      );
      await pkiApplicationProfileDAL.update(
        { applicationId, profileId },
        { microsoftAutoenrollmentConfigId: created.id },
        tx
      );
      return created;
    });

    return {
      applicationId,
      applicationName: application.name,
      profileId,
      microsoftAutoenrollment: $buildMicrosoftAutoenrollmentState({
        applicationId,
        profileId,
        applicationProfileId: junction.id,
        profileName: profile.slug,
        config: savedConfig
      }),
      isChanged: !existingConfig || isConfigChanged,
      connectionName: connection.name,
      keytabSource: newKeytab?.source ?? MicrosoftAutoenrollmentKeytabSource.Unchanged,
      reusedFromProfileId: newKeytab?.reusedFromProfileId,
      reusedFromProfileName: newKeytab?.reusedFromProfileName
    };
  };

  const clearMicrosoftAutoenrollmentEnrollment = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TClearMethodEnrollmentDTO) => {
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.microsoftAutoenrollmentConfigId) {
      return { applicationId, applicationName: application.name, profileId };
    }
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update(
        { applicationId, profileId },
        { microsoftAutoenrollmentConfigId: null },
        tx
      );
      await microsoftAutoenrollmentEnrollmentConfigDAL.deleteById(
        junction.microsoftAutoenrollmentConfigId as string,
        tx
      );
    });
    return { applicationId, applicationName: application.name, profileId };
  };

  const reenrollMicrosoftAutoenrollmentComputers = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TClearMethodEnrollmentDTO) => {
    const { junction, application } = await $assertEditEnrollment(
      applicationId,
      profileId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    );
    if (!junction.microsoftAutoenrollmentConfigId) {
      throw new BadRequestError({
        message: "Microsoft Autoenrollment is not turned on for this profile in the application."
      });
    }
    const [updated] = await microsoftAutoenrollmentEnrollmentConfigDAL.update(
      { id: junction.microsoftAutoenrollmentConfigId },
      { templateMinorRevision: 0, $incr: { templateMajorRevision: 1 } }
    );
    return {
      applicationId,
      applicationName: application.name,
      profileId,
      templateMajorRevision: updated.templateMajorRevision
    };
  };

  const listMicrosoftAutoenrollmentGroups = async ({
    applicationId,
    profileId,
    connectionId,
    search,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    actorRootOrgId,
    actorParentOrgId
  }: TListMicrosoftAutoenrollmentGroupsDTO) => {
    await $assertEditEnrollment(applicationId, profileId, projectId, actor, actorId, actorAuthMethod, actorOrgId);
    const connection = await $resolveMicrosoftAutoenrollmentConnection({
      connectionId,
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      actorRootOrgId,
      actorParentOrgId
    });

    const groups = await $searchMicrosoftAutoenrollmentGroups(connection, search);
    return { groups };
  };

  const getMicrosoftAutoenrollmentServicePrincipal = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetMicrosoftAutoenrollmentServicePrincipalDTO) => {
    await $assertReadEnrollment(applicationId, profileId, projectId, actor, actorId, actorAuthMethod, actorOrgId);

    return { servicePrincipalName: await resolveInstanceServicePrincipalName() };
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
    clearScepEnrollment,
    setMicrosoftAutoenrollmentEnrollment,
    clearMicrosoftAutoenrollmentEnrollment,
    reenrollMicrosoftAutoenrollmentComputers,
    listMicrosoftAutoenrollmentGroups,
    getMicrosoftAutoenrollmentServicePrincipal
  };
};
