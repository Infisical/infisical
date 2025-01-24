import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { getAuthToken } from "@app/services/app-connection/gcp";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretMap } from "../secret-sync-types";
import {
  GCPLatestSecretVersionAccess,
  GCPSecret,
  GCPSMListSecretsRes,
  TGcpSyncWithCredentials
} from "./gcp-sync-types";

const getGcpSecrets = async (accessToken: string, secretSync: TGcpSyncWithCredentials) => {
  let gcpSecrets: GCPSecret[] = [];

  const pageSize = 100;
  let pageToken: string | undefined;
  let hasMorePages = true;

  while (hasMorePages) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      ...(pageToken ? { pageToken } : {})
    });

    // eslint-disable-next-line no-await-in-loop
    const { data: secretsRes } = await request.get<GCPSMListSecretsRes>(
      `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${secretSync.destinationConfig.projectId}/secrets`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    if (secretsRes.secrets) {
      gcpSecrets = gcpSecrets.concat(secretsRes.secrets);
    }

    if (!secretsRes.nextPageToken) {
      hasMorePages = false;
    }

    pageToken = secretsRes.nextPageToken;
  }

  return gcpSecrets;
};

export const GcpSyncFns = {
  syncSecrets: async (secretSync: TGcpSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, connection } = secretSync;
    const accessToken = await getAuthToken(connection);

    const gcpSecrets = await getGcpSecrets(accessToken, secretSync);
    const res: { [key: string]: string } = {};

    for await (const gcpSecret of gcpSecrets) {
      const arr = gcpSecret.name.split("/");
      const key = arr[arr.length - 1];

      const { data: secretLatest } = await request.get<GCPLatestSecretVersionAccess>(
        `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${destinationConfig.projectId}/secrets/${key}/versions/latest:access`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );

      res[key] = Buffer.from(secretLatest.payload.data, "base64").toString("utf-8");
    }

    for await (const key of Object.keys(secretMap)) {
      if (!(key in res)) {
        // case: create secret
        await request.post(
          `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${destinationConfig.projectId}/secrets`,
          {
            replication: {
              automatic: {}
            }
          },
          {
            params: {
              secretId: key
            },
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );

        if (!secretMap[key].value) {
          logger.warn(
            `syncSecretsGcpsecretManager: create secret value in gcp where [key=${key}] and  [projectId=${destinationConfig.projectId}]`
          );
        }

        await request.post(
          `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${destinationConfig.projectId}/secrets/${key}:addVersion`,
          {
            payload: {
              data: Buffer.from(secretMap[key].value).toString("base64")
            }
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      }
    }

    for await (const key of Object.keys(res)) {
      if (!(key in secretMap)) {
        // case: delete secret
        await request.delete(
          `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${destinationConfig.projectId}/secrets/${key}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      } else if (secretMap[key].value !== res[key]) {
        if (!secretMap[key].value) {
          logger.warn(
            `syncSecretsGcpsecretManager: update secret value in gcp where [key=${key}] and [projectId=${destinationConfig.projectId}]`
          );
        }

        await request.post(
          `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${destinationConfig.projectId}/secrets/${key}:addVersion`,
          {
            payload: {
              data: Buffer.from(secretMap[key].value).toString("base64")
            }
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      }
    }
  },
  getSecrets: async (secretSync: TGcpSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TGcpSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, connection } = secretSync;
    const accessToken = await getAuthToken(connection);

    const gcpSecrets = await getGcpSecrets(accessToken, secretSync);
    for await (const entry of gcpSecrets) {
      const arr = entry.name.split("/");
      const key = arr[arr.length - 1];
      if (key in secretMap) {
        await request.delete(
          `${IntegrationUrls.GCP_SECRET_MANAGER_URL}/v1/projects/${destinationConfig.projectId}/secrets/${key}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
      }
    }
  }
};
