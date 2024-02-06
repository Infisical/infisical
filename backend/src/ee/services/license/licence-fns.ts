import axios, { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";

import { TFeatureSet } from "./license-types";

export const getDefaultOnPremFeatures = (): TFeatureSet => ({
  _id: null,
  slug: null,
  tier: -1,
  workspaceLimit: 5000,
  workspacesUsed: 0,
  memberLimit: 5000,
  membersUsed: 0,
  environmentLimit: 5000,
  environmentsUsed: 0,
  secretVersioning: true,
  pitRecovery: true,
  ipAllowlisting: true,
  rbac: true,
  customRateLimits: true,
  customAlerts: true,
  auditLogs: true,
  auditLogsRetentionDays: 14,
  samlSSO: true,
  status: null,
  trial_end: null,
  has_used_trial: true,
  secretApproval: true,
  secretRotation: true
});

export const setupLicenceRequestWithStore = (baseURL: string, refreshUrl: string, licenseKey: string) => {
  let token: string;
  const licenceReq = axios.create({
    baseURL,
    timeout: 35 * 1000
    // signal: AbortSignal.timeout(60 * 1000)
  });

  const refreshLicence = async () => {
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

  licenceReq.interceptors.request.use(
    (config) => {
      if (token && config.headers) {
        // eslint-disable-next-line no-param-reassign
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (err) => Promise.reject(err)
  );

  licenceReq.interceptors.response.use(
    (response) => response,
    async (err) => {
      const originalRequest = (err as AxiosError).config;

      // eslint-disable-next-line
      if ((err as AxiosError)?.response?.status === 401 && !(originalRequest as any)._retry) {
        // eslint-disable-next-line
        (originalRequest as any)._retry = true; // injected

        // refresh
        await refreshLicence();

        licenceReq.defaults.headers.common.Authorization = `Bearer ${token}`;
        return licenceReq(originalRequest!);
      }

      return Promise.reject(err);
    }
  );

  return { request: licenceReq, refreshLicence };
};
