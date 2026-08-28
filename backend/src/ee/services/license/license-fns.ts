import { Knex } from "knex";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { getConfig, TEnvConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { LicenseType, TFeatureSet, TLicenseKeyConfig, TOfflineLicenseContents } from "./license-types";

export const isOfflineLicenseKey = (licenseKey: string): boolean => {
  try {
    const contents = JSON.parse(Buffer.from(licenseKey, "base64").toString("utf8")) as TOfflineLicenseContents;

    return "signature" in contents && "license" in contents;
  } catch (error) {
    return false;
  }
};

export const getLicenseKeyConfig = (
  config?: Pick<TEnvConfig, "LICENSE_KEY" | "LICENSE_KEY_OFFLINE">
): TLicenseKeyConfig => {
  const cfg = config || getConfig();

  if (!cfg) {
    return { isValid: false };
  }

  const licenseKey = cfg.LICENSE_KEY;

  if (licenseKey) {
    if (isOfflineLicenseKey(licenseKey)) {
      return { isValid: true, licenseKey, type: LicenseType.Offline };
    }

    return { isValid: true, licenseKey, type: LicenseType.Online };
  }

  const offlineLicenseKey = cfg.LICENSE_KEY_OFFLINE;

  // backwards compatibility
  if (offlineLicenseKey) {
    if (isOfflineLicenseKey(offlineLicenseKey)) {
      return { isValid: true, licenseKey: offlineLicenseKey, type: LicenseType.Offline };
    }

    return { isValid: false };
  }

  return { isValid: false };
};

export const getDefaultOnPremFeatures = (): TFeatureSet => ({
  _id: null,
  slug: null,
  tier: -1,
  workspaceLimit: null,
  workspacesUsed: 0,
  secretSyncLimit: null,
  maxInternalCas: null,
  maxPamAccounts: null,
  memberLimit: null,
  environmentLimit: null,
  environmentsUsed: 0,
  identityLimit: null,
  dynamicSecret: false,
  secretVersioning: true,
  pitRecovery: false,
  ipAllowlisting: false,
  rbac: false,
  githubOrgSync: false,
  customRateLimits: false,
  subOrganization: false,
  customAlerts: false,
  secretAccessInsights: false,
  auditLogs: false,
  auditLogsRetentionDays: 0,
  auditLogStreams: false,
  auditLogStreamLimit: 3,
  samlSSO: false,
  enforceGoogleSSO: false,
  hsm: false,
  oidcSSO: false,
  scim: false,
  ldap: false,
  groups: false,
  status: null,
  trial_end: null,
  has_used_trial: true,
  secretApproval: false,
  secretRotation: false,
  caCrl: false,
  instanceUserManagement: false,
  externalKms: false,
  rateLimits: {
    readLimit: 60,
    writeLimit: 200,
    secretsLimit: 40
  },
  pkiEst: false,
  pkiAcme: true,
  pkiScep: false,
  pkiPqc: false,
  pkiCodeSigning: null,
  kmsPqc: false,
  enforceMfa: false,
  projectTemplates: false,
  kmip: false,
  gateway: false,
  gatewayPool: false,
  pamSlackNotifications: false,
  secretScanning: false,
  enterpriseSecretSyncs: false,
  enterpriseCertificateSyncs: false,
  enterpriseAppConnections: false,
  fips: false,
  eventSubscriptions: false,
  machineIdentityAuthTemplates: false,
  pkiLegacyTemplates: false,
  secretShareExternalBranding: false,
  honeyTokens: false,
  honeyTokenLimit: 0,
  secretsBrokering: true,
  // product gating
  pam: null,
  certManager: null,
  secretsTemporaryAccess: null,
  enterprisePamAccount: null,
  crossProjectSecretSharing: false,
  secretsFolderRbac: true
});

export const getEnforcedIdentityLimit = (plan: TFeatureSet): number | null => {
  const isEnterpriseBypass = plan?.slug === "enterprise" && !plan?.enforceIdentityLimit;
  if (isEnterpriseBypass) return null;
  return plan?.identityLimit ?? null;
};

export const throwOnPlanSeatLimitReached = async ({
  licenseService,
  orgId,
  identityLimit,
  tx,
  aliasType
}: {
  licenseService: Pick<TLicenseServiceFactory, "getOrgSeatUsage">;
  orgId: string;
  identityLimit: number | null;
  tx: Knex;
  aliasType?: UserAliasType;
}) => {
  if (!identityLimit) return;

  const { identitiesUsed } = await licenseService.getOrgSeatUsage(orgId, tx);
  if (identitiesUsed >= identityLimit) {
    // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
    throw new BadRequestError({
      message: `Failed to create new member${aliasType ? ` via ${aliasType.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
    });
  }
};
