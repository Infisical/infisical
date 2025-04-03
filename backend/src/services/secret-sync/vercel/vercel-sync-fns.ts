/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { VercelEnvironmentType } from "./vercel-sync-enums";
import { TVercelSyncWithCredentials, VercelApiSecret } from "./vercel-sync-types";

const getVercelSecrets = async (secretSync: TVercelSyncWithCredentials) => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  const params: { [key: string]: string } = {
    decrypt: "true",
    ...(destinationConfig.branch ? { gitBranch: destinationConfig.branch } : {})
  };

  const { data } = await request.get<{ envs: VercelApiSecret[] }>(
    `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env`,
    {
      params,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  const filteredSecrets = data.envs.filter((secret) => {
    // For environment-specific filtering
    if (secret.target.includes(destinationConfig.env)) {
      // If it's preview environment with a branch specified
      if (
        destinationConfig.env === VercelEnvironmentType.Preview &&
        destinationConfig.branch &&
        secret.gitBranch &&
        secret.gitBranch !== destinationConfig.branch
      ) {
        return false;
      }
      return true;
    }
    return false;
  });

  // For secrets of type "encrypted", we need to get their decrypted value
  const secretsWithValues = await Promise.all(
    filteredSecrets.map(async (secret) => {
      if (secret.type === "encrypted") {
        const { data: decryptedSecret } = await request.get(
          `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${secret.id}`,
          {
            params,
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        );
        return decryptedSecret as VercelApiSecret;
      }
      return secret;
    })
  );

  return secretsWithValues;
};

const deleteSecret = async (secretSync: TVercelSyncWithCredentials, vercelSecret: VercelApiSecret) => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  try {
    await request.delete(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${vercelSecret.id}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: vercelSecret.key
    });
  }
};

const createSecret = async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap, key: string) => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;

    await request.post(
      `${IntegrationUrls.VERCEL_API_URL}/v10/projects/${destinationConfig.app}/env`,
      {
        key,
        value: secretMap[key].value,
        type: "encrypted",
        target: [destinationConfig.env],
        ...(destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch
          ? { gitBranch: destinationConfig.branch }
          : {})
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: key
    });
  }
};

const updateSecret = async (
  secretSync: TVercelSyncWithCredentials,
  secretMap: TSecretMap,
  vercelSecret: VercelApiSecret
) => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;

    // Only update if not sensitive type
    if (vercelSecret.type !== "sensitive") {
      await request.patch(
        `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${vercelSecret.id}`,
        {
          key: vercelSecret.key,
          value: secretMap[vercelSecret.key].value,
          type: vercelSecret.type,
          target: vercelSecret.target.includes(destinationConfig.env)
            ? [...vercelSecret.target]
            : [...vercelSecret.target, destinationConfig.env],
          ...(destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch
            ? { gitBranch: destinationConfig.branch }
            : {})
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );
    } else {
      logger.info(`Vercel secret ${vercelSecret.key} is of type 'sensitive' and cannot be updated through the API`);
    }
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: vercelSecret.key
    });
  }
};

export const VercelSyncFns = {
  syncSecrets: async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap) => {
    const vercelSecrets = await getVercelSecrets(secretSync);
    const vercelSecretsMap = new Map(vercelSecrets.map((s) => [s.key, s]));

    // Create or update secrets
    for await (const key of Object.keys(secretMap)) {
      const existingSecret = vercelSecretsMap.get(key);

      if (!existingSecret) {
        await createSecret(secretSync, secretMap, key);
      } else if (existingSecret.value !== secretMap[key].value) {
        await updateSecret(secretSync, secretMap, existingSecret);
      }
    }

    // Delete secrets if disableSecretDeletion is not set
    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const vercelSecret of vercelSecrets) {
      if (!secretMap[vercelSecret.key]) {
        await deleteSecret(secretSync, vercelSecret);
      }
    }
  },

  getSecrets: async (secretSync: TVercelSyncWithCredentials): Promise<TSecretMap> => {
    const vercelSecrets = await getVercelSecrets(secretSync);
    return Object.fromEntries(vercelSecrets.map((s) => [s.key, { value: s.value ?? "" }]));
  },

  removeSecrets: async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap) => {
    const vercelSecrets = await getVercelSecrets(secretSync);

    for await (const vercelSecret of vercelSecrets) {
      if (vercelSecret.key in secretMap) {
        await deleteSecret(secretSync, vercelSecret);
      }
    }
  }
};
