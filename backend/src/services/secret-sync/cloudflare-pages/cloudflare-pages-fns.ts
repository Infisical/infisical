import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TCloudflarePagesSyncWithCredentials } from "./cloudflare-pages-types";

const getProjectEnvironmentSecrets = async (secretSync: TCloudflarePagesSyncWithCredentials) => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken, accountId }
    }
  } = secretSync;

  const secrets = (
    await request.get<{
      result: {
        deployment_configs: Record<
          string,
          {
            env_vars: Record<string, { type: "plain_text" | "secret_text"; value: string }>;
          }
        >;
      };
    }>(
      `${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accountId}/pages/projects/${destinationConfig.projectName}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.result.deployment_configs[destinationConfig.environment].env_vars;

  return Object.entries(secrets ?? {}).map(([key, envVar]) => ({
    key,
    value: envVar.value
  }));
};

export const CloudflarePagesSyncFns = {
  syncSecrets: async (secretSync: TCloudflarePagesSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken, accountId }
      }
    } = secretSync;

    // Create/update secret entries
    let secretEntries: [string, object | null][] = Object.entries(secretMap).map(([key, val]) => [
      key,
      { type: "secret_text", value: val.value }
    ]);

    // Handle deletions if not disabled
    if (!secretSync.syncOptions.disableSecretDeletion) {
      const existingSecrets = await getProjectEnvironmentSecrets(secretSync);
      const toDeleteKeys = existingSecrets
        .filter(
          (secret) =>
            matchesSchema(secret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
            !secretMap[secret.key]
        )
        .map((secret) => secret.key);

      const toDeleteEntries: [string, null][] = toDeleteKeys.map((key) => [key, null]);
      secretEntries = [...secretEntries, ...toDeleteEntries];
    }

    const data = {
      deployment_configs: {
        [destinationConfig.environment]: {
          env_vars: Object.fromEntries(secretEntries)
        }
      }
    };

    await request.patch(
      `${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accountId}/pages/projects/${destinationConfig.projectName}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        }
      }
    );
  },

  getSecrets: async (secretSync: TCloudflarePagesSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TCloudflarePagesSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken, accountId }
      }
    } = secretSync;

    const secrets = await getProjectEnvironmentSecrets(secretSync);
    const toDeleteKeys = secrets
      .filter(
        (secret) =>
          matchesSchema(secret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
          secret.key in secretMap
      )
      .map((secret) => secret.key);

    if (toDeleteKeys.length === 0) return;

    const secretEntries: [string, null][] = toDeleteKeys.map((key) => [key, null]);

    const data = {
      deployment_configs: {
        [destinationConfig.environment]: {
          env_vars: Object.fromEntries(secretEntries)
        }
      }
    };

    await request.patch(
      `${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accountId}/pages/projects/${destinationConfig.projectName}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        }
      }
    );
  }
};
