import axios, { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";

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
  dynamicSecret: false,
  secretVersioning: true,
  pitRecovery: false,
  ipAllowlisting: false,
  rbac: false,
  customRateLimits: false,
  customAlerts: false,
  auditLogs: false,
  auditLogsRetentionDays: 0,
  auditLogStreams: false,
  auditLogStreamLimit: 3,
  samlSSO: false,
  oidcSSO: false,
  scim: false,
  ldap: false,
  groups: false,
  status: null,
  trial_end: null,
  has_used_trial: true,
  secretApproval: false,
  secretRotation: true,
  caCrl: false,
  instanceUserManagement: false,
  externalKms: false,
  rateLimits: {
    readLimit: 60,
    writeLimit: 200,
    secretsLimit: 40
  },
  pkiEst: false
});

export const setupLicenseRequestWithStore = (baseURL: string, refreshUrl: string, licenseKey: string) => {
  let token: string;
  const licenseReq = axios.create({
    baseURL,
    timeout: 35 * 1000
    // signal: AbortSignal.timeout(60 * 1000)
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

      // eslint-disable-next-line
      if ((err as AxiosError)?.response?.status === 401 && !(originalRequest as any)._retry) {
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
