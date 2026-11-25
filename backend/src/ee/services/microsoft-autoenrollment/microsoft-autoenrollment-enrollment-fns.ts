import { TPkiMicrosoftAutoenrollmentConfigs } from "@app/db/schemas";
import { TKmsDataKeyService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { TProjectPermission } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TLdapConnection } from "@app/services/app-connection/ldap/ldap-connection-types";
import {
  assertLdapProviderIsSupported,
  resolveDirectorySecurityGroupNames,
  searchDirectoryGroups,
  TLdapDirectoryGatewayServices,
  withActiveDirectoryErrors
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { parsePolicyTtlMs } from "@app/services/certificate-policy/certificate-policy-fns";
import { resolveEffectiveTtl } from "@app/services/certificate-v3/certificate-v3-fns";
import {
  TMicrosoftAutoenrollmentAllowedGroup,
  TMicrosoftAutoenrollmentEnrollmentConfigDALFactory
} from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";

import { readChannelBindingStatus } from "./microsoft-autoenrollment-channel-binding-fns";
import { buildPolicyUrl, mergeAllowedGroups, readUploadedKeytab } from "./microsoft-autoenrollment-fns";
import { buildPolicyId, buildTemplateOid, resolveRenewalPeriodSeconds } from "./microsoft-autoenrollment-template-fns";
import { MicrosoftAutoenrollmentKeytabSource } from "./microsoft-autoenrollment-types";

type TMicrosoftAutoenrollmentConnection = TLdapConnection & { id: string };

type TMicrosoftAutoenrollmentConfigWithGroups = Omit<TPkiMicrosoftAutoenrollmentConfigs, "allowedGroups"> & {
  allowedGroups: TMicrosoftAutoenrollmentAllowedGroup[];
};

export const MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS = 42;

const MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL_DAYS = 365;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const toWholeUnitTtl = (durationMs: number) =>
  durationMs % MS_PER_DAY === 0 ? `${durationMs / MS_PER_DAY}d` : `${Math.floor(durationMs / MS_PER_HOUR)}h`;

export const resolveMicrosoftAutoenrollmentTtl = async (
  profile: { certificatePolicyId: string; defaults?: { ttlDays?: number } | null },
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">
) => {
  const policy = await certificatePolicyDAL.findById(profile.certificatePolicyId);
  const policyMaxValidity = policy?.validity?.max;
  const policyMaxMs = policyMaxValidity ? parsePolicyTtlMs(policyMaxValidity) : null;
  return resolveEffectiveTtl({
    requestTtl: undefined,
    profileDefaultTtlDays: profile.defaults?.ttlDays,
    policyMaxValidity,
    flowDefaultTtl:
      policyMaxMs && policyMaxMs < MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL_DAYS * MS_PER_DAY
        ? toWholeUnitTtl(policyMaxMs)
        : `${MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL_DAYS}d`
  });
};

export const buildMicrosoftAutoenrollmentState = ({
  applicationId,
  profileId,
  applicationProfileId,
  profileName,
  config,
  ttl,
  channelBinding
}: {
  applicationId: string;
  profileId: string;
  applicationProfileId: string;
  profileName: string;
  config: TMicrosoftAutoenrollmentConfigWithGroups;
  ttl: string | null;
  channelBinding: Awaited<ReturnType<typeof readChannelBindingStatus>>;
}) => ({
  id: config.id,
  policyUrl: buildPolicyUrl(applicationId, profileId),
  policyId: buildPolicyId(applicationProfileId),
  templateName: profileName,
  templateOid: buildTemplateOid(applicationProfileId),
  allowedGroups: config.allowedGroups,
  renewBeforeDays: config.renewBeforeDays,
  effectiveRenewBeforeSeconds: ttl ? resolveRenewalPeriodSeconds(config.renewBeforeDays, ms(ttl) / 1000) : null,
  servicePrincipalName: config.servicePrincipalName,
  keyVersion: config.keyVersion,
  connectionId: config.appConnectionId,
  allowAnyChannelBinding: config.allowAnyChannelBinding,
  channelBinding
});

export const resolveMicrosoftAutoenrollmentConnection = async (
  {
    connectionId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    actorRootOrgId,
    actorParentOrgId
  }: { connectionId: string; actorRootOrgId: string; actorParentOrgId: string } & TProjectPermission,
  {
    appConnectionService
  }: { appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById"> }
) => {
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
  if (connection.app !== AppConnection.LDAP) {
    throw new BadRequestError({
      message: `App connection '${connection.name}' is not an LDAP connection. Microsoft Autoenrollment requires an Active Directory connection.`
    });
  }
  assertLdapProviderIsSupported(
    connection.credentials.provider,
    connection.name,
    "Microsoft Autoenrollment looks computers up by their security identifier in Active Directory, so it requires an Active Directory connection."
  );
  return connection;
};

export const resolveMicrosoftAutoenrollmentAllowedGroups = async (
  {
    connection,
    isConnectionChanged,
    allowedGroupSids,
    storedGroups
  }: {
    connection: TMicrosoftAutoenrollmentConnection;
    isConnectionChanged: boolean;
    allowedGroupSids: string[];
    storedGroups: TMicrosoftAutoenrollmentAllowedGroup[];
  },
  gatewayServices: TLdapDirectoryGatewayServices
): Promise<TMicrosoftAutoenrollmentAllowedGroup[]> => {
  if (!allowedGroupSids.length) {
    if (isConnectionChanged) {
      await searchDirectoryGroups({ config: connection, search: undefined }, gatewayServices).catch(
        withActiveDirectoryErrors(connection)
      );
    }
    return [];
  }

  const hasNewGroups = allowedGroupSids.some((sid) => !storedGroups.some((group) => group.sid === sid));
  const resolvedNames = await resolveDirectorySecurityGroupNames(
    { config: connection, sids: allowedGroupSids },
    gatewayServices
  ).catch(
    isConnectionChanged || hasNewGroups
      ? withActiveDirectoryErrors(connection)
      : (err: unknown) => {
          logger.warn(
            { err },
            `Unable to resolve Microsoft Autoenrollment group names from Active Directory [connectionId=${connection.id}]`
          );
          return null;
        }
  );
  if (resolvedNames) {
    const unresolvedGroups = allowedGroupSids
      .filter((sid) => !resolvedNames[sid])
      .map((sid) => {
        const storedName = storedGroups.find((group) => group.sid === sid)?.name;
        return storedName ? `'${storedName}' (${sid})` : sid;
      });
    if (unresolvedGroups.length) {
      throw new BadRequestError({
        message: `The LDAP connection '${connection.name}' does not find ${unresolvedGroups.join(", ")} as security groups in its directory. Only security groups appear in a computer's Kerberos ticket, so remove those groups or choose security groups from the directory of '${connection.name}'.`
      });
    }
  }
  return mergeAllowedGroups(allowedGroupSids, resolvedNames, storedGroups);
};

const encryptKeytab = async (kmsKeyService: TKmsKeyService, certificateManagerKmsId: string, keytabFile: Buffer) => {
  const kmsEncryptor = await kmsKeyService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
  return kmsEncryptor({ plainText: keytabFile });
};

export const resolveMicrosoftAutoenrollmentKeytab = async (
  {
    applicationId,
    applicationName,
    profileId,
    projectId,
    keytab,
    reuseKeytab,
    storedEncryptedKeytab
  }: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    projectId: string;
    keytab?: string;
    reuseKeytab?: { profileId: string };
    storedEncryptedKeytab?: Buffer;
  },
  {
    microsoftAutoenrollmentEnrollmentConfigDAL,
    kmsDataKeyService,
    kmsKeyService
  }: {
    microsoftAutoenrollmentEnrollmentConfigDAL: Pick<
      TMicrosoftAutoenrollmentEnrollmentConfigDALFactory,
      "findKeytabByApplicationAndProfile" | "primaryNode"
    >;
    kmsDataKeyService: TKmsDataKeyService;
    kmsKeyService: TKmsKeyService;
  }
) => {
  if (keytab) {
    const keytabFile = Buffer.from(keytab, "base64");
    const { servicePrincipalName, keyVersion } = readUploadedKeytab(keytabFile);
    const certificateManagerKmsId = await kmsDataKeyService.getProjectCertificateKmsKeyId(projectId);
    if (storedEncryptedKeytab) {
      const kmsDecryptor = await kmsKeyService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
      if (keytabFile.equals(await kmsDecryptor({ cipherTextBlob: storedEncryptedKeytab }))) return null;
    }
    const { cipherTextBlob } = await encryptKeytab(kmsKeyService, certificateManagerKmsId, keytabFile);
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
    if (reuseKeytab.profileId === profileId) {
      throw new BadRequestError({
        message:
          "A profile cannot reuse its own keytab. Choose another profile in this application, or upload the keytab file instead."
      });
    }
    const source = await microsoftAutoenrollmentEnrollmentConfigDAL.findKeytabByApplicationAndProfile(
      applicationId,
      reuseKeytab.profileId,
      microsoftAutoenrollmentEnrollmentConfigDAL.primaryNode()
    );
    if (!source) {
      throw new BadRequestError({
        message: `Profile '${reuseKeytab.profileId}' has no Microsoft Autoenrollment keytab in application '${applicationName}'. Choose a profile in this application that has Microsoft Autoenrollment turned on, or upload the keytab file instead.`
      });
    }
    if (storedEncryptedKeytab && source.encryptedKeytab.equals(storedEncryptedKeytab)) return null;
    return {
      source: MicrosoftAutoenrollmentKeytabSource.Reused,
      encryptedKeytab: source.encryptedKeytab,
      servicePrincipalName: source.servicePrincipalName,
      keyVersion: source.keyVersion,
      reusedFromProfileId: source.profileId,
      reusedFromProfileName: source.profileName
    };
  }

  return null;
};
