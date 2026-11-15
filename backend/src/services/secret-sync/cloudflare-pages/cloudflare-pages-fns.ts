import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { CloudflarePagesVariableType } from "./cloudflare-pages-constants";
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
            env_vars: Record<string, { type: CloudflarePagesVariableType; value: string }>;
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

  return Object.entries(secrets ?? {}).map(([key, envVar]) => ({ key, type: envVar.type }));
};

const VARIABLE_TYPE_LABELS: Record<CloudflarePagesVariableType, string> = {
  [CloudflarePagesVariableType.Secret]: "secret",
  [CloudflarePagesVariableType.Text]: "text"
};

export const CloudflarePagesSyncFns = {
  syncSecrets: async (secretSync: TCloudflarePagesSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken, accountId }
      }
    } = secretSync;
    const variableType = destinationConfig.variableType ?? CloudflarePagesVariableType.Secret;

    const existingSecrets = await getProjectEnvironmentSecrets(secretSync);

    // Changing a variable's type would expose a secret's value or hide a readable one, so a sync never changes
    // one; it fails before writing anything. A sync created before the type could be chosen (no variableType)
    // skips those keys instead, so it keeps running as it did.
    const secretMapKeys = new Set(Object.keys(secretMap));
    const conflicts = existingSecrets.filter((secret) => secretMapKeys.has(secret.key) && secret.type !== variableType);
    if (conflicts.length > 0 && destinationConfig.variableType) {
      throw new SecretSyncError({
        message: `The following secrets already exist in the Cloudflare Pages environment as a different type: ${conflicts
          .map(({ key, type }) => `${key} (${VARIABLE_TYPE_LABELS[type]})`)
          .join(
            ", "
          )}. Infisical doesn't change a variable's type, so nothing was synced. Delete them in Cloudflare or change the sync's variable type, then sync again.`,
        shouldRetry: false
      });
    }

    const skippedKeys = new Set(conflicts.map((secret) => secret.key));

    // Create/update secret entries
    let secretEntries: [string, object | null][] = Object.entries(secretMap)
      .filter(([key]) => !skippedKeys.has(key))
      .map(([key, val]) => [key, { type: variableType, value: val.value }]);

    // Handle deletions if not disabled. A sync only owns variables of its type, so syncs of different types can
    // share an environment.
    if (!secretSync.syncOptions.disableSecretDeletion) {
      const toDeleteKeys = existingSecrets
        .filter(
          (secret) =>
            secret.type === variableType &&
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

  removeSecrets: async (secretSync: TCloudflarePagesSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken, accountId }
      }
    } = secretSync;
    const { variableType = CloudflarePagesVariableType.Secret } = destinationConfig;

    const secrets = await getProjectEnvironmentSecrets(secretSync);
    const toDeleteKeys = secrets
      .filter(
        (secret) =>
          secret.type === variableType &&
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
