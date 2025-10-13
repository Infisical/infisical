import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  LaravelForgeSecret,
  TGetLaravelForgeSecrets,
  TLaravelForgeSecrets,
  TLaravelForgeSyncWithCredentials
} from "./laravel-forge-sync-types";

const getLaravelForgeSecretsRaw = async ({ apiToken, orgSlug, serverId, siteId }: TGetLaravelForgeSecrets) => {
  const { data } = await request.get<TLaravelForgeSecrets>(
    `${IntegrationUrls.LARAVELFORGE_API_URL}/api/orgs/${orgSlug}/servers/${serverId}/sites/${siteId}/environment`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    }
  );

  return data.data.attributes.content;
};

const parseEnv = (str: string) => {
  const lines = str.split("\n");
  const parsed: { key: string; value: string }[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();

    const isInvalidLine = trimmed === "" || trimmed.startsWith("#");

    if (!isInvalidLine && trimmed.includes("=")) {
      const equalIndex = trimmed.indexOf("=");
      const key = trimmed.substring(0, equalIndex).trim();
      const valueRaw = trimmed.substring(equalIndex + 1).trim();
      let value = valueRaw;

      if ((value.startsWith(`"`) && value.endsWith(`"`)) || (value.startsWith(`'`) && value.endsWith(`'`))) {
        value = value.slice(1, -1);
      }

      parsed.push({
        key,
        value
      });
    }
  });

  return parsed;
};

const getLaravelForgeSecrets = async (secretSync: TLaravelForgeSyncWithCredentials): Promise<LaravelForgeSecret[]> => {
  const {
    connection,
    destinationConfig: { orgSlug, serverId, siteId }
  } = secretSync;

  const { apiToken } = connection.credentials;

  const secrets = await getLaravelForgeSecretsRaw({ apiToken, orgSlug, serverId, siteId });

  const parsedSecrets = parseEnv(secrets);

  return parsedSecrets;
};

const buildEnvString = (secrets: LaravelForgeSecret[]) => {
  return secrets
    .map((secret) => {
      if (secret.value.includes(" ")) {
        return `${secret.key}="${secret.value}"`;
      }
      return `${secret.key}=${secret.value}`;
    })
    .join("\n");
};

const updateLaravelForgeSecrets = async (secretSync: TLaravelForgeSyncWithCredentials, envString: string) => {
  const {
    connection,
    destinationConfig: { orgSlug, serverId, siteId }
  } = secretSync;

  const { apiToken } = connection.credentials;

  await request.put(
    `${IntegrationUrls.LARAVELFORGE_API_URL}/api/orgs/${orgSlug}/servers/${serverId}/sites/${siteId}/environment`,
    {
      environment: envString
    },

    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    }
  );
};

export const LaravelForgeSyncFns = {
  async syncSecrets(secretSync: TLaravelForgeSyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const secrets = await getLaravelForgeSecrets(secretSync);

    // Create a map of the existing secrets
    const updatedSecretsMap = new Map(secrets.map((secret) => [secret.key, secret.value]));

    for (const [key, { value }] of Object.entries(secretMap)) {
      // Add the new secrets to the map
      updatedSecretsMap.set(key, value);
    }

    if (!disableSecretDeletion) {
      secrets.forEach((secret) => {
        if (!matchesSchema(secret.key, environment?.slug || "", keySchema)) return;

        if (!secretMap[secret.key]) {
          updatedSecretsMap.delete(secret.key);
        }
      });
    }

    const updatedSecrets = Array.from(updatedSecretsMap.entries()).map(([key, value]) => ({ key, value }));

    const envString = buildEnvString(updatedSecrets);

    await updateLaravelForgeSecrets(secretSync, envString);
  },

  async getSecrets(secretSync: TLaravelForgeSyncWithCredentials): Promise<TSecretMap> {
    const secrets = await getLaravelForgeSecrets(secretSync);
    return Object.fromEntries(secrets.map((secret) => [secret.key, { value: secret.value }]));
  },

  async removeSecrets(secretSync: TLaravelForgeSyncWithCredentials, secretMap: TSecretMap) {
    const existingSecrets = await getLaravelForgeSecrets(secretSync);

    const newSecrets = existingSecrets.filter((secret) => !Object.hasOwn(secretMap, secret.key));

    if (newSecrets.length === existingSecrets.length) {
      return;
    }

    const envString = buildEnvString(newSecrets);

    await updateLaravelForgeSecrets(secretSync, envString);
  }
};
