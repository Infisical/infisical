import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { HumanitecSyncScope } from "./humanitec-sync-enums";
import { HumanitecSecret, THumanitecSyncWithCredentials } from "./humanitec-sync-types";

const getHumanitecSecrets = async (secretSync: THumanitecSyncWithCredentials) => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  let url = `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}`;
  if (destinationConfig.scope === HumanitecSyncScope.Environment) {
    url += `/envs/${destinationConfig.env}`;
  }
  url += "/values";

  const { data } = await request.get<HumanitecSecret[]>(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });

  return data;
};

const deleteSecret = async (secretSync: THumanitecSyncWithCredentials, encryptedSecret: HumanitecSecret) => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope === HumanitecSyncScope.Environment && encryptedSecret.source === "app") {
    logger.info(
      `Humanitec secret ${encryptedSecret.key} on app ${destinationConfig.app} has no environment override, not deleted as it is an app-level secret`
    );
    return;
  }

  try {
    let url = `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}`;
    if (destinationConfig.scope === HumanitecSyncScope.Environment) {
      url += `/envs/${destinationConfig.env}`;
    }
    url += `/values/${encryptedSecret.key}`;

    await request.delete(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });
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
        credentials: { apiToken }
      }
    } = secretSync;

    const appLevelSecret = destinationConfig.scope === HumanitecSyncScope.Application ? secretMap[key].value : "";
    await request.post(
      `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/values`,
      {
        key,
        value: appLevelSecret,
        description: secretMap[key].comment || "",
        is_secret: true
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        }
      }
    );
    if (destinationConfig.scope === HumanitecSyncScope.Environment) {
      await request.patch(
        `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values/${key}`,
        {
          value: secretMap[key].value,
          description: secretMap[key].comment || ""
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: "application/json"
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
};

const updateSecret = async (
  secretSync: THumanitecSyncWithCredentials,
  secretMap: TSecretMap,
  encryptedSecret: HumanitecSecret
) => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;
    if (destinationConfig.scope === HumanitecSyncScope.Application) {
      await request.patch(
        `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/values/${encryptedSecret.key}`,
        {
          value: secretMap[encryptedSecret.key].value,
          description: secretMap[encryptedSecret.key].comment || ""
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: "application/json"
          }
        }
      );
    } else if (encryptedSecret.source === "app") {
      await request.post(
        `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values`,
        {
          value: secretMap[encryptedSecret.key].value,
          description: secretMap[encryptedSecret.key].comment || "",
          key: encryptedSecret.key,
          is_secret: true
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: "application/json"
          }
        }
      );
    } else {
      await request.patch(
        `${IntegrationUrls.HUMANITEC_API_URL}/orgs/${destinationConfig.org}/apps/${destinationConfig.app}/envs/${destinationConfig.env}/values/${encryptedSecret.key}`,
        {
          value: secretMap[encryptedSecret.key].value,
          description: secretMap[encryptedSecret.key].comment || ""
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: "application/json"
          }
        }
      );
    }
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: encryptedSecret.key
    });
  }
};

export const HumanitecSyncFns = {
  syncSecrets: async (secretSync: THumanitecSyncWithCredentials, secretMap: TSecretMap) => {
    const humanitecSecrets = await getHumanitecSecrets(secretSync);
    const humanitecSecretsKeys = new Map(humanitecSecrets.map((s) => [s.key, s]));

    for await (const key of Object.keys(secretMap)) {
      const existingSecret = humanitecSecretsKeys.get(key);

      if (!existingSecret) {
        await createSecret(secretSync, secretMap, key);
      } else {
        await updateSecret(secretSync, secretMap, existingSecret);
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const humanitecSecret of humanitecSecrets) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(humanitecSecret.key, secretSync.syncOptions.keySchema)) continue;

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
