import { request } from "@app/lib/config/request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getCamundaConnectionAccessToken } from "@app/services/app-connection/camunda";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import {
  TCamundaCreateSecret,
  TCamundaDeleteSecret,
  TCamundaListSecrets,
  TCamundaListSecretsResponse,
  TCamundaPutSecret,
  TCamundaSyncWithCredentials
} from "@app/services/secret-sync/camunda/camunda-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { TSecretMap } from "../secret-sync-types";

type TCamundaSecretSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const getCamundaSecrets = async ({ accessToken, clusterUUID }: TCamundaListSecrets) => {
  const { data } = await request.get<TCamundaListSecretsResponse>(
    `${IntegrationUrls.CAMUNDA_API_URL}/clusters/${clusterUUID}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  return data;
};

const createCamundaSecret = async ({ accessToken, clusterUUID, key, value }: TCamundaCreateSecret) =>
  request.post(
    `${IntegrationUrls.CAMUNDA_API_URL}/clusters/${clusterUUID}/secrets`,
    {
      secretName: key,
      secretValue: value
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

const deleteCamundaSecret = async ({ accessToken, clusterUUID, key }: TCamundaDeleteSecret) =>
  request.delete(`${IntegrationUrls.CAMUNDA_API_URL}/clusters/${clusterUUID}/secrets/${key}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Encoding": "application/json"
    }
  });

const updateCamundaSecret = async ({ accessToken, clusterUUID, key, value }: TCamundaPutSecret) =>
  request.put(
    `${IntegrationUrls.CAMUNDA_API_URL}/clusters/${clusterUUID}/secrets/${key}`,
    {
      secretValue: value
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

export const camundaSyncFactory = ({ kmsService, appConnectionDAL }: TCamundaSecretSyncFactoryDeps) => {
  const syncSecrets = async (secretSync: TCamundaSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { clusterUUID },
      connection
    } = secretSync;

    const accessToken = await getCamundaConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const camundaSecrets = await getCamundaSecrets({ accessToken, clusterUUID });

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      if (!value) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        if (camundaSecrets[key] === undefined) {
          await createCamundaSecret({
            key,
            value,
            clusterUUID,
            accessToken
          });
        } else if (camundaSecrets[key] !== value) {
          await updateCamundaSecret({
            key,
            value,
            clusterUUID,
            accessToken
          });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const secret of Object.keys(camundaSecrets)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(secret, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      if (!(secret in secretMap) || !secretMap[secret].value) {
        try {
          await deleteCamundaSecret({
            key: secret,
            clusterUUID,
            accessToken
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: secret
          });
        }
      }
    }
  };

  const removeSecrets = async (secretSync: TCamundaSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { clusterUUID },
      connection
    } = secretSync;

    const accessToken = await getCamundaConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const camundaSecrets = await getCamundaSecrets({ accessToken, clusterUUID });

    for await (const secret of Object.keys(camundaSecrets)) {
      if (!(secret in secretMap)) {
        await deleteCamundaSecret({
          key: secret,
          clusterUUID,
          accessToken
        });
      }
    }
  };

  const getSecrets = async (secretSync: TCamundaSyncWithCredentials) => {
    const {
      destinationConfig: { clusterUUID },
      connection
    } = secretSync;

    const accessToken = await getCamundaConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const camundaSecrets = await getCamundaSecrets({ accessToken, clusterUUID });

    return Object.fromEntries(Object.entries(camundaSecrets).map(([key, value]) => [key, { value }]));
  };

  return {
    syncSecrets,
    removeSecrets,
    getSecrets
  };
};
