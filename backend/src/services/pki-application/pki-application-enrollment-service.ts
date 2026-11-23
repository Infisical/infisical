import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ResourceType } from "@app/db/schemas";
import { TKmsDataKeyService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { readChannelBindingStatus } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-channel-binding-fns";
import {
  buildMicrosoftAutoenrollmentState,
  resolveMicrosoftAutoenrollmentTtl,
  MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS,
  resolveMicrosoftAutoenrollmentAllowedGroups,
  resolveMicrosoftAutoenrollmentConnection,
  resolveMicrosoftAutoenrollmentKeytab
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-enrollment-fns";
import {
  assertProfileCaSupportsMicrosoftAutoenrollment,
  getMicrosoftAutoenrollmentUnsupportedReason,
  loadTemplateSigningCa,
  resolveInstanceServicePrincipalName
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-fns";
import { findTemplatePolicyProblem } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-template-fns";
import {
  MICROSOFT_AUTOENROLLMENT_NOT_ENABLED_MESSAGE,
  MicrosoftAutoenrollmentKeytabSource
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
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
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { TProjectPermission } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import { TCertRequestPolicy } from "@app/services/approval-policy/cert-request/cert-request-policy-types";
import type { TCaKeySourceServiceFactory } from "@app/services/certificate-authority/ca-key-source/ca-key-source-service";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CERTIFICATE_AUTHORITIES_TYPE_MAP } from "@app/services/certificate-authority/certificate-authority-maps";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { MICROSOFT_AUTOENROLLMENT_EXTENSION_OIDS } from "@app/services/certificate-common/certificate-constants";
import { findMicrosoftAutoenrollmentRuleProblems } from "@app/services/certificate-common/certificate-extension-fns";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
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
    reuseKeytab?: { profileId: string };
    allowAnyChannelBinding?: boolean;
  };
  actorRootOrgId: string;
  actorParentOrgId: string;
} & TProjectPermission;

const sortedSids = (sids: string[]) => [...sids].sort().join(",");

type TPkiApplicationEnrollmentServiceFactoryDep = {
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  pkiApplicationProfileDAL: Pick<
    TPkiApplicationProfileDALFactory,
    "findOneByApplicationAndProfile" | "transaction" | "update" | "primaryNode"
  >;
  apiEnrollmentConfigDAL: Pick<TApiEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  estEnrollmentConfigDAL: Pick<TEstEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  acmeEnrollmentConfigDAL: Pick<TAcmeEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "create" | "updateById" | "deleteById" | "findById">;
  microsoftAutoenrollmentEnrollmentConfigDAL: Pick<
    TMicrosoftAutoenrollmentEnrollmentConfigDALFactory,
    | "create"
    | "update"
    | "delete"
    | "findById"
    | "findByApplicationId"
    | "findKeytabByApplicationAndProfile"
    | "primaryNode"
  >;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  licenseService: TLicenseService;
  approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "matchPolicy">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById" | "lockById">;
  certificatePolicyService: Pick<TCertificatePolicyServiceFactory, "validateRequestAgainstPolicy">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find">;
  caKeySourceService: Pick<TCaKeySourceServiceFactory, "buildSigner">;
  kmsDataKeyService: TKmsDataKeyService;
  kmsKeyService: TKmsKeyService;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
  keyStore: Pick<TKeyStoreFactory, "getItem">;
};

export type TPkiApplicationEnrollmentServiceFactory = ReturnType<typeof pkiApplicationEnrollmentServiceFactory>;

const CONCURRENT_MICROSOFT_AUTOENROLLMENT_SAVE_MESSAGE =
  "Microsoft Autoenrollment settings for this profile changed while this save was in progress. Save again.";

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
  certificatePolicyDAL,
  certificatePolicyService,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCertDAL,
  caKeySourceService,
  kmsDataKeyService,
  kmsKeyService,
  permissionService,
  keyStore
}: TPkiApplicationEnrollmentServiceFactoryDep) => {
  const $loadJunction = async (applicationId: string, profileId: string, projectId: string, junctionDb?: Knex) => {
    const application = await pkiApplicationDAL.findById(applicationId);
    if (!application || application.projectId !== projectId) {
      throw new NotFoundError({ message: `Application with id '${applicationId}' not found.` });
    }

    const junction = await pkiApplicationProfileDAL.findOneByApplicationAndProfile(
      applicationId,
      profileId,
      junctionDb
    );
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
    actorOrgId: TProjectPermission["actorOrgId"],
    junctionDb?: Knex
  ) => {
    const { junction, application } = await $loadJunction(applicationId, profileId, projectId, junctionDb);
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

  const $findPolicyBlocker = async (
    profile: { slug: string; certificatePolicyId: string; caId?: string | null; defaults?: unknown },
    tx?: Knex
  ) => {
    const policy = await certificatePolicyDAL.findById(profile.certificatePolicyId, tx);
    if (!policy) return `Certificate policy for profile '${profile.slug}' not found.`;
    const signingCa = await loadTemplateSigningCa(
      profile.caId,
      { certificateAuthorityDAL, certificateAuthoritySecretDAL },
      tx
    );
    const keyProblem = findTemplatePolicyProblem(
      profile,
      signingCa,
      (request) =>
        certificatePolicyService.validateRequestAgainstPolicy(policy, request, { skipRequired: true }).isValid
    );
    if (keyProblem) return keyProblem;
    const ruleProblems = findMicrosoftAutoenrollmentRuleProblems(policy.customExtensions);
    if (!ruleProblems.length) return null;
    return `Profile '${profile.slug}' has a certificate policy that restricts custom extensions, and Microsoft Autoenrollment adds ${MICROSOFT_AUTOENROLLMENT_EXTENSION_OIDS.join(" and ")} to every certificate. ${ruleProblems.join(" ")} You can also turn off the policy's custom extension restriction.`;
  };

  const $findInactiveCaReason = async (profile: { slug: string; caId?: string | null }, tx?: Knex) => {
    const ca = profile.caId ? await certificateAuthorityDAL.findById(profile.caId, tx) : undefined;
    if (!ca || ca.status === CaStatus.ACTIVE) return null;
    return ca.status === CaStatus.PENDING_CERTIFICATE
      ? `Profile '${profile.slug}' issues from a certificate authority that is still waiting for its certificate, so Windows can't get the issuing CA certificate. Install the CA certificate first.`
      : `Profile '${profile.slug}' issues from a certificate authority that is disabled. Enable the certificate authority first.`;
  };

  const $assertPolicyAllowsMicrosoftAutoenrollment = async (
    profile: { slug: string; certificatePolicyId: string; caId?: string | null; defaults?: unknown },
    tx?: Knex
  ) => {
    const blocker = await $findPolicyBlocker(profile, tx);
    if (blocker) throw new BadRequestError({ message: blocker });
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
    const microsoftAutoenrollmentUnsupportedReason = profile
      ? ((await getMicrosoftAutoenrollmentUnsupportedReason(
          {
            profileSlug: profile.slug,
            caId: profile.caId,
            keyAlgorithm: (profile.defaults as TCertificateProfileDefaults | null)?.keyAlgorithm
          },
          certificateAuthorityDAL
        )) ??
        (junction.microsoftAutoenrollmentConfigId
          ? null
          : ((await $findInactiveCaReason(profile)) ?? (await $findPolicyBlocker(profile)))))
      : null;

    const microsoftAutoenrollmentConfigs =
      await microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId(applicationId);
    const microsoftAutoenrollmentConfig = junction.microsoftAutoenrollmentConfigId
      ? await microsoftAutoenrollmentEnrollmentConfigDAL.findById(junction.microsoftAutoenrollmentConfigId)
      : undefined;

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
      microsoftAutoenrollment:
        microsoftAutoenrollmentConfig && profile
          ? buildMicrosoftAutoenrollmentState({
              applicationId,
              profileId,
              applicationProfileId: junction.id,
              profileName: profile.slug,
              config: microsoftAutoenrollmentConfig,
              ttl: await resolveMicrosoftAutoenrollmentTtl(
                {
                  certificatePolicyId: profile.certificatePolicyId,
                  defaults: profile.defaults as TCertificateProfileDefaults | null
                },
                certificatePolicyDAL
              ).catch((error: unknown) => {
                if (error instanceof BadRequestError) return null;
                throw error;
              }),
              channelBinding: await readChannelBindingStatus(keyStore)
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
      microsoftAutoenrollmentUnsupportedReason,
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
      const result = await validateAndEncryptPemCaChain(
        config.caChain as string,
        projectId,
        kmsDataKeyService,
        kmsKeyService
      );
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

    const newEabSecret = junction.acmeConfigId
      ? undefined
      : (await generateAndEncryptAcmeEabSecret(projectId, kmsDataKeyService, kmsKeyService)).encryptedEabSecret;

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
        const created = await acmeEnrollmentConfigDAL.create(
          {
            skipDnsOwnershipVerification: config.skipDnsOwnershipVerification ?? false,
            skipEabBinding: config.skipEabBinding ?? false,
            encryptedEabSecret: newEabSecret as Buffer,
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

    const certificateManagerKmsId = await kmsDataKeyService.getProjectCertificateKmsKeyId(projectId);
    const kmsDecryptor = await kmsKeyService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
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
    const { encryptedEabSecret } = await generateAndEncryptAcmeEabSecret(projectId, kmsDataKeyService, kmsKeyService);
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
          kmsDataKeyService,
          kmsKeyService,
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
      actorOrgId,
      pkiApplicationProfileDAL.primaryNode()
    );

    const plan = await licenseService.getPlan(actorOrgId);
    plan.assert(PlanFeature.PkiMicrosoftAutoenrollment);

    const existingConfig = junction.microsoftAutoenrollmentConfigId
      ? await microsoftAutoenrollmentEnrollmentConfigDAL.findById(
          junction.microsoftAutoenrollmentConfigId,
          microsoftAutoenrollmentEnrollmentConfigDAL.primaryNode()
        )
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
    await $assertPolicyAllowsMicrosoftAutoenrollment(profile);
    const microsoftAutoenrollmentTtl = await resolveMicrosoftAutoenrollmentTtl(
      {
        certificatePolicyId: profile.certificatePolicyId,
        defaults: profile.defaults as TCertificateProfileDefaults | null
      },
      certificatePolicyDAL
    );

    const storedGroups = existingConfig?.allowedGroups ?? [];
    const allowedGroupSids =
      config.allowedGroupSids === undefined ? storedGroups.map((group) => group.sid) : (config.allowedGroupSids ?? []);
    const isAllowedGroupSidsChanged =
      sortedSids(allowedGroupSids) !== sortedSids(storedGroups.map((group) => group.sid));

    const connectionId = config.connectionId ?? existingConfig?.appConnectionId;
    if (!connectionId) {
      throw new BadRequestError({
        message:
          "Select the LDAP connection used to look up computers in Active Directory to turn on Microsoft Autoenrollment."
      });
    }
    const isConnectionChanged = connectionId !== existingConfig?.appConnectionId;
    const isAllowedGroupsChanged = isConnectionChanged || isAllowedGroupSidsChanged;

    const isDirectoryLookupNeeded = isAllowedGroupsChanged && allowedGroupSids.length > 0;
    const ldapConnection =
      config.connectionId || isDirectoryLookupNeeded
        ? await resolveMicrosoftAutoenrollmentConnection(
            {
              connectionId,
              projectId,
              actor,
              actorId,
              actorAuthMethod,
              actorOrgId,
              actorRootOrgId,
              actorParentOrgId
            },
            { appConnectionService }
          )
        : null;
    const connection = ldapConnection ?? (await appConnectionDAL.findById(connectionId));
    if (!connection) {
      throw new NotFoundError({ message: `LDAP connection with ID '${connectionId}' not found.` });
    }

    let allowedGroups = isAllowedGroupsChanged ? [] : storedGroups;
    if (isAllowedGroupsChanged && ldapConnection) {
      allowedGroups = await resolveMicrosoftAutoenrollmentAllowedGroups(
        { connection: ldapConnection, isConnectionChanged, allowedGroupSids, storedGroups },
        { gatewayV2Service, gatewayPoolService }
      );
    }

    const newKeytab = await resolveMicrosoftAutoenrollmentKeytab(
      {
        applicationId,
        applicationName: application.name,
        profileId,
        projectId,
        keytab: config.keytab,
        reuseKeytab: config.reuseKeytab,
        storedEncryptedKeytab: existingConfig?.encryptedKeytab
      },
      { microsoftAutoenrollmentEnrollmentConfigDAL, kmsDataKeyService, kmsKeyService }
    );
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
      renewBeforeDays:
        config.renewBeforeDays ?? existingConfig?.renewBeforeDays ?? MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS,
      allowAnyChannelBinding: config.allowAnyChannelBinding ?? existingConfig?.allowAnyChannelBinding ?? false
    };
    const storedAllowedGroups = allowedGroups.length ? JSON.stringify(allowedGroups) : null;
    const isConfigChanged =
      Boolean(newKeytab) ||
      isAllowedGroupsChanged ||
      configFields.renewBeforeDays !== existingConfig?.renewBeforeDays ||
      configFields.allowAnyChannelBinding !== existingConfig?.allowAnyChannelBinding;

    let savedProfileSlug = profile.slug;
    const savedConfig = await pkiApplicationProfileDAL
      .transaction(async (tx) => {
        await certificatePolicyDAL.lockById(profile.certificatePolicyId, tx);
        const lockedProfile = (await certificateProfileDAL.findById(profileId, tx)) ?? profile;
        savedProfileSlug = lockedProfile.slug;
        const lockedInactiveCaReason = existingConfig ? null : await $findInactiveCaReason(lockedProfile, tx);
        if (lockedInactiveCaReason) throw new BadRequestError({ message: lockedInactiveCaReason });
        await assertProfileCaSupportsMicrosoftAutoenrollment(
          {
            profileSlug: lockedProfile.slug,
            caId: lockedProfile.caId,
            keyAlgorithm: (lockedProfile.defaults as TCertificateProfileDefaults | null)?.keyAlgorithm
          },
          certificateAuthorityDAL,
          tx
        );
        await $assertPolicyAllowsMicrosoftAutoenrollment(lockedProfile, tx);
        if (existingConfig) {
          if (!isConfigChanged) return existingConfig;
          const [updated] = await microsoftAutoenrollmentEnrollmentConfigDAL.update(
            {
              id: existingConfig.id,
              templateMajorRevision: existingConfig.templateMajorRevision,
              templateMinorRevision: existingConfig.templateMinorRevision
            },
            { ...configFields, allowedGroups: storedAllowedGroups, $incr: { templateMinorRevision: 1 } },
            tx
          );
          if (!updated) {
            throw new ConflictError({
              message: CONCURRENT_MICROSOFT_AUTOENROLLMENT_SAVE_MESSAGE
            });
          }
          return updated;
        }

        const created = await microsoftAutoenrollmentEnrollmentConfigDAL.create(
          { ...configFields, allowedGroups: storedAllowedGroups, applicationProfileId: junction.id },
          tx
        );
        await pkiApplicationProfileDAL.update(
          { applicationId, profileId },
          { microsoftAutoenrollmentConfigId: created.id },
          tx
        );
        return created;
      })
      .catch((error: unknown) => {
        if (hasPostgresErrorCode(error, DatabaseErrorCode.UniqueViolation)) {
          throw new ConflictError({ message: CONCURRENT_MICROSOFT_AUTOENROLLMENT_SAVE_MESSAGE });
        }
        if (hasPostgresErrorCode(error, DatabaseErrorCode.ForeignKeyViolation)) {
          throw new ConflictError({
            message:
              "The profile was removed from this application, or the LDAP connection was deleted, while this save was in progress. Reload and try again."
          });
        }
        throw error;
      });

    return {
      applicationId,
      applicationName: application.name,
      profileId,
      profileName: savedProfileSlug,
      microsoftAutoenrollment: buildMicrosoftAutoenrollmentState({
        applicationId,
        profileId,
        applicationProfileId: junction.id,
        profileName: savedProfileSlug,
        config: { ...savedConfig, allowedGroups },
        ttl: microsoftAutoenrollmentTtl,
        channelBinding: await readChannelBindingStatus(keyStore)
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
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) throw new NotFoundError({ message: `Certificate profile with ID '${profileId}' not found` });
    await pkiApplicationProfileDAL.transaction(async (tx) => {
      await pkiApplicationProfileDAL.update({ id: junction.id }, { microsoftAutoenrollmentConfigId: null }, tx);
      await microsoftAutoenrollmentEnrollmentConfigDAL.delete({ applicationProfileId: junction.id }, tx);
    });
    return { applicationId, applicationName: application.name, profileId, profileName: profile.slug };
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
      actorOrgId,
      pkiApplicationProfileDAL.primaryNode()
    );
    const plan = await licenseService.getPlan(actorOrgId);
    plan.assert(PlanFeature.PkiMicrosoftAutoenrollment);
    if (!junction.microsoftAutoenrollmentConfigId) {
      throw new NotFoundError({ message: MICROSOFT_AUTOENROLLMENT_NOT_ENABLED_MESSAGE });
    }
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) throw new NotFoundError({ message: `Certificate profile with ID '${profileId}' not found` });
    const [updated] = await microsoftAutoenrollmentEnrollmentConfigDAL.update(
      { id: junction.microsoftAutoenrollmentConfigId },
      { templateMinorRevision: 0, $incr: { templateMajorRevision: 1 } }
    );
    if (!updated) {
      throw new NotFoundError({ message: MICROSOFT_AUTOENROLLMENT_NOT_ENABLED_MESSAGE });
    }
    return {
      applicationId,
      applicationName: application.name,
      profileId,
      profileName: profile.slug,
      templateMajorRevision: updated.templateMajorRevision
    };
  };

  const getMicrosoftAutoenrollmentServicePrincipal = async ({
    applicationId,
    profileId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetEnrollmentDTO) => {
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
    getMicrosoftAutoenrollmentServicePrincipal
  };
};
