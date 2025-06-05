import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";
import {
  TCoolifyAPICreateEnvResponse,
  TCoolifyAPIResponse,
  TCoolifyNewSecret,
  TCoolifySecret,
  TCoolifySyncWithCredentials
} from "./coolify-sync-types";
import { getCoolifyInstanceUrl } from "@app/services/app-connection/coolify";
import { request } from "@app/lib/config/request";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

const getAllCoolifySecrets = async (secretSync: TCoolifySyncWithCredentials) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  const resp = await request.get<TCoolifySecret[]>(`${instanceUrl}/api/v1/applications/${appId}/envs`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });

  return resp.data;
};

const createCoolifySecret = async (secretSync: TCoolifySyncWithCredentials, secret: TCoolifyNewSecret) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  await request.post<TCoolifyAPICreateEnvResponse>(`${instanceUrl}/api/v1/applications/${appId}/envs`, secret, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ContentType: "application/json"
    }
  });
};

const updateCoolifySecret = async (
  secretSync: TCoolifySyncWithCredentials,
  secret: Omit<TCoolifyNewSecret, "is_multiline">
) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  await request.patch<TCoolifyAPIResponse>(`${instanceUrl}/api/v1/applications/${appId}/envs`, secret, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ContentType: "application/json"
    }
  });
};

const deleteCoolifySecret = async (secretSync: TCoolifySyncWithCredentials, envId: string) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  await request.delete<TCoolifyAPIResponse>(`${instanceUrl}/api/v1/applications/${appId}/envs/${envId}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });
};

const infisicalSecretToCoolifySecret = (key: string, secret: TSecretMap[keyof TSecretMap]): TCoolifyNewSecret => {
  return {
    key,
    value: secret.value,
    is_build_time: !!secret.secretMetadata?.find((m) => m.key === "is_build_time"),
    is_literal: !!secret.secretMetadata?.find((m) => m.key === "is_literal"),
    is_preview: !!secret.secretMetadata?.find((m) => m.key === "is_preview")
  };
};

export const CoolifySyncFns = {
  syncSecrets: async (secretSync: TCoolifySyncWithCredentials, secretMap: TSecretMap) => {
    const existingCoolifySecrets = await getAllCoolifySecrets(secretSync);

    for await (const entry of Object.entries(secretMap)) {
      const [key, secret] = entry;
      try {
        // Check if exists
        const coolifySecret = existingCoolifySecrets.find((s) => s.key === key);
        const newSecret = infisicalSecretToCoolifySecret(key, secret);
        if (coolifySecret) {
          await updateCoolifySecret(secretSync, newSecret);
        } else {
          await createCoolifySecret(secretSync, newSecret);
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const coolifySecret of existingCoolifySecrets) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(coolifySecret.key, secretSync.syncOptions.keySchema)) continue;

      if (!(coolifySecret.key in secretMap)) {
        try {
          await deleteCoolifySecret(secretSync, coolifySecret.uuid);
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: coolifySecret.key
          });
        }
      }
    }
  },
  getSecrets: async (secretSync: TCoolifySyncWithCredentials): Promise<TSecretMap> => {
    const allSecrets = await getAllCoolifySecrets(secretSync);

    const result: TSecretMap = {};

    for (const secret of allSecrets) {
      result[secret.key] = {
        value: secret.real_value,
        skipMultilineEncoding: secret.is_multiline,
        secretMetadata: [
          { key: "key", value: String(secret.is_build_time) },
          { key: "key", value: String(secret.is_literal) },
          { key: "key", value: String(secret.is_preview) }
        ]
      };
    }

    return result;
  },
  removeSecrets: async (secretSync: TCoolifySyncWithCredentials, secretMap: TSecretMap) => {
    const allSecrets = await getAllCoolifySecrets(secretSync);

    for await (const secret of Object.keys(secretMap)) {
      const coolifySecret = allSecrets.find((s) => s.key === secret);
      if (coolifySecret) {
        await deleteCoolifySecret(secretSync, coolifySecret.uuid);
      }
    }
  }
};
