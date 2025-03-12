import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { HumanitecSecret, THumanitecSyncWithCredentials } from "./humanitec-sync-types";

const getHumanitecSecrets = async (secretSync: THumanitecSyncWithCredentials) => {
  const {
    destinationConfig,
    connection: {
      credentials: { accessKeyId }
    }
  } = secretSync;

  const { data } = await request.get<HumanitecSecret[]>(
    `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values`,
    {
      headers: {
        Authorization: `Bearer ${accessKeyId}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  return data;
};

const deleteSecret = async (secretSync: THumanitecSyncWithCredentials, encryptedSecret: HumanitecSecret) => {
  const {
    destinationConfig,
    connection: {
      credentials: { accessKeyId }
    }
  } = secretSync;

  try {
    await request.delete(
      `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values/${encryptedSecret.key}`,
      {
        headers: {
          Authorization: `Bearer ${accessKeyId}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: encryptedSecret.key
    });
  }
};

const createSecret = async (secretSync: THumanitecSyncWithCredentials, secretMap: TSecretMap, key: string) => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { accessKeyId }
      }
    } = secretSync;

    await request.post(
      `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/values`,
      {
        key,
        value: "",
        description: secretMap[key].comment || ""
      },
      {
        headers: {
          Authorization: `Bearer ${accessKeyId}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
    await request.patch(
      `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values/${key}`,
      {
        value: secretMap[key].value,
        description: secretMap[key].comment || ""
      },
      {
        headers: {
          Authorization: `Bearer ${accessKeyId}`,
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

const updateSecret = async (secretSync: THumanitecSyncWithCredentials, secretMap: TSecretMap, key: string) => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { accessKeyId }
      }
    } = secretSync;
    await request.patch(
      `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values/${key}`,
      {
        value: secretMap[key].value,
        description: secretMap[key].comment
      },
      {
        headers: {
          Authorization: `Bearer ${accessKeyId}`,
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

export const HumanitecSyncFns = {
  syncSecrets: async (secretSync: THumanitecSyncWithCredentials, secretMap: TSecretMap) => {
    const humanitecSecrets = await getHumanitecSecrets(secretSync);
    const humanitecSecretsKeys = new Set(humanitecSecrets.map((s) => s.key));
    for await (const key of Object.keys(secretMap)) {
      if (!humanitecSecretsKeys.has(key)) {
        await createSecret(secretSync, secretMap, key);
      } else {
        await updateSecret(secretSync, secretMap, key);
      }
    }

    for await (const humanitecSecret of humanitecSecrets) {
      if (!secretMap[humanitecSecret.key]) {
        await deleteSecret(secretSync, humanitecSecret);
      }
    }
  },
  getSecrets: async (secretSync: THumanitecSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: THumanitecSyncWithCredentials, secretMap: TSecretMap) => {
    const encryptedSecrets = await getHumanitecSecrets(secretSync);

    for await (const encryptedSecret of encryptedSecrets) {
      if (encryptedSecret.key in secretMap) {
        await deleteSecret(secretSync, encryptedSecret);
      }
    }
  }
};
