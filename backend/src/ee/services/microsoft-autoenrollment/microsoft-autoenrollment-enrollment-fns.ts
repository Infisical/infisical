import { TPkiMicrosoftAutoenrollmentConfigs } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { TProjectPermission } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TLdapConnection } from "@app/services/app-connection/ldap/ldap-connection-types";
import {
  assertLdapProviderIsSupported,
  LdapTargetConfigurationError,
  resolveDirectorySidNames,
  searchDirectoryGroups,
  TLdapDirectoryGatewayServices
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { resolveEffectiveTtl } from "@app/services/certificate-v3/certificate-v3-fns";
import {
  TMicrosoftAutoenrollmentAllowedGroup,
  TMicrosoftAutoenrollmentEnrollmentConfigDALFactory
} from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { readChannelBindingStatus } from "./microsoft-autoenrollment-channel-binding-fns";
import { buildPolicyUrl, mergeAllowedGroups, readUploadedKeytab } from "./microsoft-autoenrollment-fns";
import { buildPolicyId, buildTemplateOid, resolveRenewalPeriodSeconds } from "./microsoft-autoenrollment-template-fns";
import { MicrosoftAutoenrollmentKeytabSource } from "./microsoft-autoenrollment-types";

type TDirectoryConnection = { id: string; name: string };

type TMicrosoftAutoenrollmentConnection = TLdapConnection & { id: string };

type TMicrosoftAutoenrollmentConfigWithGroups = Omit<TPkiMicrosoftAutoenrollmentConfigs, "allowedGroups"> & {
  allowedGroups: TMicrosoftAutoenrollmentAllowedGroup[];
};

export const MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS = 42;

const MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL = "365d";
const SECONDS_PER_HOUR = 3600;

export const resolveMicrosoftAutoenrollmentTtl = async (
  profile: { certificatePolicyId: string; defaults?: { ttlDays?: number } | null },
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">
) => {
  const policy = await certificatePolicyDAL.findById(profile.certificatePolicyId);
  const policyMaxValidity = policy?.validity?.max;
  return resolveEffectiveTtl({
    requestTtl: undefined,
    profileDefaultTtlDays: profile.defaults?.ttlDays,
    policyMaxValidity,
    flowDefaultTtl:
      policyMaxValidity && ms(policyMaxValidity) < ms(MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL)
        ? policyMaxValidity
        : MICROSOFT_AUTOENROLLMENT_DEFAULT_TTL
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
  ttl: string;
  channelBinding: Awaited<ReturnType<typeof readChannelBindingStatus>>;
}) => ({
  id: config.id,
  policyUrl: buildPolicyUrl(applicationId, profileId),
  policyId: buildPolicyId(applicationProfileId),
  templateName: profileName,
  templateOid: buildTemplateOid(applicationProfileId),
  allowedGroups: config.allowedGroups,
  renewBeforeDays: config.renewBeforeDays,
  effectiveRenewBeforeHours: Math.floor(
    resolveRenewalPeriodSeconds(config.renewBeforeDays, ms(ttl) / 1000) / SECONDS_PER_HOUR
  ),
  servicePrincipalName: config.servicePrincipalName,
  keyVersion: config.keyVersion,
  connectionId: config.appConnectionId,
  allowAnyChannelBinding: config.allowAnyChannelBinding,
  channelBinding,
  keytabMismatch:
    config.mismatchedServicePrincipalName && config.mismatchFirstSeenAt
      ? {
          servicePrincipalName: config.mismatchedServicePrincipalName,
          firstSeenAt: config.mismatchFirstSeenAt,
          requestCount: config.mismatchRequestCount
        }
      : null
});

const withActiveDirectoryErrors =
  (connection: TDirectoryConnection) =>
  (err: unknown): never => {
    if (err instanceof LdapTargetConfigurationError) throw err;
    logger.warn({ err }, `Unable to search Active Directory [connectionId=${connection.id}]`);
    const details = err instanceof BadRequestError ? ` Details: ${err.message}` : "";
    throw new BadRequestError({
      message: `Could not search Active Directory with the LDAP connection '${connection.name}'. Check that the directory is reachable and the connection's credentials are valid.${details}`
    });
  };

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

export const searchMicrosoftAutoenrollmentGroups = (
  connection: TMicrosoftAutoenrollmentConnection,
  search: string | undefined,
  gatewayServices: TLdapDirectoryGatewayServices
) =>
  searchDirectoryGroups({ config: connection, search }, gatewayServices).catch(withActiveDirectoryErrors(connection));

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
    if (isConnectionChanged) await searchMicrosoftAutoenrollmentGroups(connection, undefined, gatewayServices);
    return [];
  }

  const resolvedNames = await resolveDirectorySidNames(
    { config: connection, sids: allowedGroupSids },
    gatewayServices
  ).catch(
    isConnectionChanged
      ? withActiveDirectoryErrors(connection)
      : (err: unknown) => {
          logger.warn(
            { err },
            `Unable to resolve Microsoft Autoenrollment group names from Active Directory [connectionId=${connection.id}]`
          );
          return null;
        }
  );
  if (isConnectionChanged) {
    const unresolvedGroups = allowedGroupSids
      .filter((sid) => !resolvedNames?.[sid])
      .map((sid) => {
        const storedName = storedGroups.find((group) => group.sid === sid)?.name;
        return storedName ? `'${storedName}' (${sid})` : sid;
      });
    if (unresolvedGroups.length) {
      throw new BadRequestError({
        message: `The LDAP connection '${connection.name}' does not find the allowed groups ${unresolvedGroups.join(", ")} in its directory. Remove those groups, or choose groups from the directory of '${connection.name}'.`
      });
    }
  }
  return mergeAllowedGroups(allowedGroupSids, resolvedNames, storedGroups);
};

const encryptKeytab = async (
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey">,
  certificateManagerKmsId: string,
  keytabFile: Buffer
) => {
  const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
  return kmsEncryptor({ plainText: keytabFile });
};

export const resolveMicrosoftAutoenrollmentKeytab = async (
  {
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
    reuseKeytab?: { profileId: string };
  },
  {
    microsoftAutoenrollmentEnrollmentConfigDAL,
    kmsService,
    projectDAL
  }: {
    microsoftAutoenrollmentEnrollmentConfigDAL: Pick<
      TMicrosoftAutoenrollmentEnrollmentConfigDALFactory,
      "findKeytabByApplicationAndProfile"
    >;
    kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey">;
    projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  }
) => {
  if (keytab) {
    const keytabFile = Buffer.from(keytab, "base64");
    const { servicePrincipalName, keyVersion } = readUploadedKeytab(keytabFile);
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const { cipherTextBlob } = await encryptKeytab(kmsService, certificateManagerKmsId, keytabFile);
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
      reuseKeytab.profileId
    );
    if (!source) {
      throw new BadRequestError({
        message: `Profile '${reuseKeytab.profileId}' has no Microsoft Autoenrollment keytab in application '${applicationName}'. Choose a profile in this application that has Microsoft Autoenrollment turned on, or upload the keytab file instead.`
      });
    }
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
