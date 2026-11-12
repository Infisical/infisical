import { safeRequest } from "@app/lib/validator";
import { getCoolifyInstanceUrl } from "@app/services/app-connection/coolify";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { COOLIFY_ENV_KEY_PATTERN, COOLIFY_ENV_KEY_RULE } from "./coolify-sync-schemas";
import {
  TCoolifyAPICreateEnvResponse,
  TCoolifyAPIResponse,
  TCoolifyNewSecret,
  TCoolifySecret,
  TCoolifySyncWithCredentials
} from "./coolify-sync-types";

const getAllCoolifySecrets = async (secretSync: TCoolifySyncWithCredentials) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  try {
    const resp = await safeRequest.get<TCoolifySecret[]>(`${instanceUrl}/api/v1/applications/${appId}/envs`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });

    return resp.data;
  } catch (error) {
    if (error instanceof SecretSyncError) throw error;
    throw new SecretSyncError({ error });
  }
};

const createCoolifySecret = async (secretSync: TCoolifySyncWithCredentials, secret: TCoolifyNewSecret) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  await safeRequest.post<TCoolifyAPICreateEnvResponse>(`${instanceUrl}/api/v1/applications/${appId}/envs`, secret, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
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

  await safeRequest.patch<TCoolifyAPIResponse>(`${instanceUrl}/api/v1/applications/${appId}/envs`, secret, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
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

  await safeRequest.delete<TCoolifyAPIResponse>(`${instanceUrl}/api/v1/applications/${appId}/envs/${envId}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });
};

const redeployApplication = async (secretSync: TCoolifySyncWithCredentials) => {
  const {
    connection,
    destinationConfig: { appId }
  } = secretSync;

  const instanceUrl = getCoolifyInstanceUrl(connection);
  const { apiToken } = connection.credentials;

  await safeRequest.post<TCoolifyAPICreateEnvResponse>(
    `${instanceUrl}/api/v1/deploy`,
    {
      uuid: appId
    },
    {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    }
  );
};

const infisicalSecretToCoolifySecret = (key: string, secret: TSecretMap[keyof TSecretMap]): TCoolifyNewSecret => {
  return {
    key,
    value: secret.value,
    is_literal: !!secret.secretMetadata?.find((m) => m.key === "is_literal"),
    is_preview: !!secret.secretMetadata?.find((m) => m.key === "is_preview")
  };
};

export const CoolifySyncFns = {
  syncSecrets: async (secretSync: TCoolifySyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();

    const invalidKeys = Object.keys(secretMap).filter((key) => !COOLIFY_ENV_KEY_PATTERN.test(key));
    if (invalidKeys.length) {
      throw new SecretSyncError({
        secretKey: invalidKeys[0],
        shouldRetry: false,
        message: `${invalidKeys.length} secret ${
          invalidKeys.length === 1 ? "key is" : "keys are"
        } not a valid Coolify environment variable name: ${invalidKeys.join(", ")}. ${COOLIFY_ENV_KEY_RULE}`
      });
    }

    const existingCoolifySecrets = await getAllCoolifySecrets(secretSync);

    for await (const entry of Object.entries(secretMap)) {
      const [key, secret] = entry;
      try {
        const coolifySecret = existingCoolifySecrets.find((s) => s.key === key);
        const newSecret = infisicalSecretToCoolifySecret(key, secret);
        if (coolifySecret) {
          await updateCoolifySecret(secretSync, newSecret);
        } else {
          await createCoolifySecret(secretSync, newSecret);
        }
      } catch (error) {
        if (error instanceof SecretSyncError) throw error;
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (!secretSync.syncOptions.disableSecretDeletion) {
      for await (const coolifySecret of existingCoolifySecrets) {
        if (!matchesSchema(coolifySecret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
          // eslint-disable-next-line no-continue
          continue;

        if (!(coolifySecret.key in secretMap)) {
          try {
            await deleteCoolifySecret(secretSync, coolifySecret.uuid);
          } catch (error) {
            if (error instanceof SecretSyncError) throw error;
            throw new SecretSyncError({
              error,
              secretKey: coolifySecret.key
            });
          }
        }
      }
    }

    if (secretSync.syncOptions.autoRedeployServices) {
      await redeployApplication(secretSync);
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
          { key: "is_literal", value: String(secret.is_literal) },
          { key: "is_preview", value: String(secret.is_preview) }
        ]
      };
    }

    return result;
  },
  removeSecrets: async (secretSync: TCoolifySyncWithCredentials, payload: TSecretSyncPayload) => {
    const allSecrets = await getAllCoolifySecrets(secretSync);
    const secretMap = payload.flatten();

    for await (const secret of Object.keys(secretMap)) {
      const coolifySecret = allSecrets.find((s) => s.key === secret);
      if (coolifySecret) {
        try {
          await deleteCoolifySecret(secretSync, coolifySecret.uuid);
        } catch (error) {
          if (error instanceof SecretSyncError) throw error;
          throw new SecretSyncError({
            error,
            secretKey: secret
          });
        }
      }
    }

    if (secretSync.syncOptions.autoRedeployServices) {
      await redeployApplication(secretSync);
    }
  }
};
