import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { getGcpConnectionAuthToken } from "@app/services/app-connection/gcp";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import {
  GCPLatestSecretVersionAccess,
  GCPSecret,
  GCPSMListSecretsRes,
  TGcpSyncWithCredentials
} from "./gcp-sync-types";

const getGcpSecrets = async (accessToken: string, secretSync: TGcpSyncWithCredentials) => {
  const { destinationConfig } = secretSync;

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

  const res: { [key: string]: string } = {};

  for await (const gcpSecret of gcpSecrets) {
    const arr = gcpSecret.name.split("/");
    const key = arr[arr.length - 1];

    try {
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
    } catch (error) {
      // when a secret in GCP has no versions, we treat it as if it's a blank value
      if (error instanceof AxiosError && error.response?.status === 404) {
        res[key] = "";
      } else {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }
  }

  return res;
};

export const GcpSyncFns = {
  syncSecrets: async (secretSync: TGcpSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, connection } = secretSync;
    const accessToken = await getGcpConnectionAuthToken(connection);

    const gcpSecrets = await getGcpSecrets(accessToken, secretSync);

    for await (const key of Object.keys(secretMap)) {
      try {
        // we do not process secrets with no value because GCP secret manager does not allow it
        if (!secretMap[key].value) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (!(key in gcpSecrets)) {
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
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    for await (const key of Object.keys(gcpSecrets)) {
      try {
        if (!(key in secretMap) || !secretMap[key].value) {
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
        } else if (secretMap[key].value !== gcpSecrets[key]) {
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
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }
  },

  getSecrets: async (secretSync: TGcpSyncWithCredentials): Promise<TSecretMap> => {
    const { connection } = secretSync;
    const accessToken = await getGcpConnectionAuthToken(connection);

    const gcpSecrets = await getGcpSecrets(accessToken, secretSync);
    return Object.fromEntries(Object.entries(gcpSecrets).map(([key, value]) => [key, { value: value ?? "" }]));
  },

  removeSecrets: async (secretSync: TGcpSyncWithCredentials, secretMap: TSecretMap) => {
    const { destinationConfig, connection } = secretSync;
    const accessToken = await getGcpConnectionAuthToken(connection);

    const gcpSecrets = await getGcpSecrets(accessToken, secretSync);
    for await (const [key] of Object.entries(gcpSecrets)) {
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
