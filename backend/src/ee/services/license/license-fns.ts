import axios, { AxiosError } from "axios";

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
  slug: null,
  tier: -1,
  workspaceLimit: null,
  workspacesUsed: 0,
  memberLimit: null,
  membersUsed: 0,
  environmentLimit: null,
  environmentsUsed: 0,
  identityLimit: null,
  identitiesUsed: 0,
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
  groups: true,
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
  pkiAcme: false,
  enforceMfa: false,
  projectTemplates: false,
  kmip: false,
  gateway: false,
  sshHostGroups: false,
  secretScanning: false,
  enterpriseSecretSyncs: false,
  enterpriseCertificateSyncs: false,
  enterpriseAppConnections: false,
  fips: false,
  eventSubscriptions: false,
  machineIdentityAuthTemplates: false,
  pkiLegacyTemplates: false,
  secretShareExternalBranding: false
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

  if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
    // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
    throw new BadRequestError({
      message: `Failed to create new member${type ? ` via ${type.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
    });
  }
};
