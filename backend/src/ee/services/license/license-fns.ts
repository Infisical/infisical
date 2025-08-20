import axios, { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";

import { TFeatureSet } from "./license-types";

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
  dynamicSecret: true,
  secretVersioning: true,
  pitRecovery: true,
  ipAllowlisting: true,
  rbac: true,
  githubOrgSync: true,
  customRateLimits: false,
  customAlerts: true,
  secretAccessInsights: true,
  auditLogs: true,
  auditLogsRetentionDays: 3,
  auditLogStreams: true,
  auditLogStreamLimit: 3,
  samlSSO: true,
  hsm: true,
  oidcSSO: true,
  scim: true,
  ldap: true,
  groups: true,
  status: null,
  trial_end: null,
  has_used_trial: true,
  secretApproval: true,
  secretRotation: true,
  caCrl: true,
  instanceUserManagement: true,
  externalKms: true,
  rateLimits: {
    readLimit: 60,
    writeLimit: 200,
    secretsLimit: 40
  },
  pkiEst: false,
  enforceMfa: false,
  projectTemplates: true,
  kmip: true,
  gateway: true,
  sshHostGroups: true,
  enterpriseAppConnections: true,
  enterpriseSecretSyncs: true,
  secretScanning: true,
  fips: true
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
