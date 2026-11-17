import { TPkiMicrosoftAutoenrollmentConfigs } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TProjectPermission } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TLdapConnectionConfig } from "@app/services/app-connection/ldap/ldap-connection-types";
import {
  assertLdapProviderIsSupported,
  LdapTargetConfigurationError,
  resolveDirectorySidNames,
  searchDirectoryGroups,
  TLdapDirectoryGatewayServices
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import {
  TMicrosoftAutoenrollmentAllowedGroup,
  TMicrosoftAutoenrollmentEnrollmentConfigDALFactory
} from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { buildPolicyUrl, mergeAllowedGroups, readUploadedKeytab } from "./microsoft-autoenrollment-fns";
import { buildPolicyId, buildTemplateOid } from "./microsoft-autoenrollment-template-fns";
import { MicrosoftAutoenrollmentKeytabSource } from "./microsoft-autoenrollment-types";

type TDirectoryConnection = { id: string; name: string };

type TMicrosoftAutoenrollmentConfigWithGroups = Omit<TPkiMicrosoftAutoenrollmentConfigs, "allowedGroups"> & {
  allowedGroups: TMicrosoftAutoenrollmentAllowedGroup[];
};

export const MICROSOFT_AUTOENROLLMENT_DEFAULT_RENEW_BEFORE_DAYS = 42;

export const buildMicrosoftAutoenrollmentState = ({
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
  config: TMicrosoftAutoenrollmentConfigWithGroups;
}) => ({
  id: config.id,
  policyUrl: buildPolicyUrl(applicationId, profileId),
  policyId: buildPolicyId(applicationProfileId),
  templateName: profileName,
  templateOid: buildTemplateOid(applicationProfileId),
  allowedGroups: config.allowedGroups,
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
  assertLdapProviderIsSupported(
    (connection.credentials as { provider?: string } | undefined)?.provider,
    connection.name,
    "Microsoft Autoenrollment looks computers up by their security identifier in Active Directory, so it requires an Active Directory connection."
  );
  return connection;
};

export const searchMicrosoftAutoenrollmentGroups = (
  connection: TDirectoryConnection,
  search: string | undefined,
  gatewayServices: TLdapDirectoryGatewayServices
) =>
  searchDirectoryGroups({ config: connection as unknown as TLdapConnectionConfig, search }, gatewayServices).catch(
    withActiveDirectoryErrors(connection)
  );

export const resolveMicrosoftAutoenrollmentAllowedGroups = async (
  {
    connection,
    isConnectionChanged,
    allowedGroupSids,
    storedGroups
  }: {
    connection: TDirectoryConnection;
    isConnectionChanged: boolean;
    allowedGroupSids: string[];
    storedGroups: TMicrosoftAutoenrollmentAllowedGroup[];
  },
  gatewayServices: TLdapDirectoryGatewayServices
): Promise<TMicrosoftAutoenrollmentAllowedGroup[]> => {
  if (isConnectionChanged) {
    if (!allowedGroupSids.length) {
      await searchMicrosoftAutoenrollmentGroups(connection, undefined, gatewayServices);
      return [];
    }
    const resolvedNames = await resolveDirectorySidNames(
      { config: connection as unknown as TLdapConnectionConfig, sids: allowedGroupSids },
      gatewayServices
    ).catch(withActiveDirectoryErrors(connection));
    return mergeAllowedGroups(allowedGroupSids, resolvedNames, storedGroups);
  }

  if (!allowedGroupSids.length) return [];
  const resolvedNames = await resolveDirectorySidNames(
    { config: connection as unknown as TLdapConnectionConfig, sids: allowedGroupSids },
    gatewayServices
  ).catch((err: unknown) => {
    logger.warn(
      { err },
      `Unable to resolve Microsoft Autoenrollment group names from Active Directory [connectionId=${connection.id}]`
    );
    return null;
  });
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
      "findByApplicationId"
    >;
    kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
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
    const configs = await microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId(applicationId);
    const source = configs.find((config) => config.profileId === reuseKeytab.profileId);
    if (!source) {
      throw new BadRequestError({
        message: `Profile '${reuseKeytab.profileId}' has no Microsoft Autoenrollment keytab in application '${applicationName}'. Choose a profile in this application that has Microsoft Autoenrollment turned on, or upload the keytab file instead.`
      });
    }
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
    const { cipherTextBlob } = await encryptKeytab(
      kmsService,
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
