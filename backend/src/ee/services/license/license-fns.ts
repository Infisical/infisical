import axios, { AxiosError } from "axios";

import { SubscriptionProductCategory } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { getConfig, TEnvConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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
  version: 2,
  productPlans: {},
  slug: null,
  tier: -1,
  memberLimit: null,
  membersUsed: 0,
  status: null,
  trial_end: null,
  has_used_trial: true,
  workspaceLimit: null,
  workspacesUsed: 0,
  identityLimit: null,
  identitiesUsed: 0,
  [SubscriptionProductCategory.Platform]: {
    ipAllowlisting: false,
    rbac: false,
    githubOrgSync: false,
    customRateLimits: false,
    subOrganization: false,
    secretScanning: false,
    enterpriseAppConnections: false,
    fips: false,
    eventSubscriptions: false,
    machineIdentityAuthTemplates: false,
    pam: false,
    ai: false,
    enforceMfa: false,
    projectTemplates: false,
    instanceUserManagement: false,
    externalKms: false,
    hsm: false,
    oidcSSO: false,
    gateway: false,
    scim: false,
    ldap: false,
    groups: false,
    auditLogs: false,
    auditLogsRetentionDays: 0,
    auditLogStreams: false,
    auditLogStreamLimit: 3,
    samlSSO: false,
    enforceGoogleSSO: false,
    rateLimits: {
      readLimit: 60,
      writeLimit: 200,
      secretsLimit: 40
    }
  },
  [SubscriptionProductCategory.SecretManager]: {
    enterpriseSecretSyncs: false,
    secretApproval: false,
    secretRotation: false,
    dynamicSecret: false,
    secretVersioning: true,
    secretAccessInsights: false,
    pitRecovery: false,
    identityLimit: 0,
    identitiesUsed: 0,
    environmentLimit: 0,
    environmentsUsed: 0,
    projectLimit: null,
    projectsUsed: 0
  },
  [SubscriptionProductCategory.CertificateManager]: {
    enterpriseCertificateSyncs: false,
    pkiEst: false,
    pkiAcme: false,
    kmip: false,
    pkiLegacyTemplates: false,
    caCrl: false,
    projectLimit: null,
    projectsUsed: 0
  },
  [SubscriptionProductCategory.Pam]: {
    sshHostGroups: false,
    identityLimit: null,
    identitiesUsed: 0,
    projectLimit: null,
    projectsUsed: 0
  },
  [SubscriptionProductCategory.SecretScanning]: {
    identityLimit: null,
    identitiesUsed: 0,
    projectLimit: null,
    projectsUsed: 0,
    sshHostGroups: false
  }
});

export const setupLicenseRequestWithStore = (
  baseURL: string,
  refreshUrl: string,
  licenseKey: string,
  region?: string
) => {
  let token: string;
  const licenseReq = axios.create({
    baseURL,
    timeout: 35 * 1000,
    headers: {
      "x-region": region
    }
  });

  const refreshLicense = async () => {
    const appCfg = getConfig();
    const {
      data: { token: authToken }
    } = await request.post<{ token: string }>(
      refreshUrl,
      {},
      {
        baseURL: appCfg.LICENSE_SERVER_URL,
        headers: {
          "X-API-KEY": licenseKey
        }
      }
    );
    token = authToken;
    return token;
  };

  licenseReq.interceptors.request.use(
    (config) => {
      if (token && config.headers) {
        // eslint-disable-next-line no-param-reassign
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (err) => Promise.reject(err)
  );

  licenseReq.interceptors.response.use(
    (response) => response,
    async (err) => {
      const originalRequest = (err as AxiosError).config;
      const errStatusCode = Number((err as AxiosError)?.response?.status);
      logger.error((err as AxiosError)?.response?.data, "License server call error");
      // eslint-disable-next-line
      if ((errStatusCode === 401 || errStatusCode === 403) && !(originalRequest as any)._retry) {
        // eslint-disable-next-line
        (originalRequest as any)._retry = true; // injected

        // refresh
        await refreshLicense();

        licenseReq.defaults.headers.common.Authorization = `Bearer ${token}`;
        return licenseReq(originalRequest!);
      }

      return Promise.reject(err);
    }
  );

  return { request: licenseReq, refreshLicense };
};

export const throwOnPlanSeatLimitReached = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  orgId: string,
  type?: UserAliasType
) => {
  const plan = await licenseService.getPlan(orgId);

  if (
    plan?.slug !== "enterprise" &&
    plan.version === 1 &&
    plan?.identityLimit &&
    plan.identitiesUsed >= plan.identityLimit
  ) {
    // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
    throw new BadRequestError({
      message: `Failed to create new member${type ? ` via ${type.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
    });
  }
};
