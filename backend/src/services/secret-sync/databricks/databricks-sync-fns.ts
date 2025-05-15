import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getDatabricksConnectionAccessToken } from "@app/services/app-connection/databricks";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import {
  TDatabricksDeleteSecret,
  TDatabricksListSecretKeys,
  TDatabricksListSecretKeysResponse,
  TDatabricksPutSecret,
  TDatabricksSyncWithCredentials
} from "@app/services/secret-sync/databricks/databricks-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";

import { TSecretMap } from "../secret-sync-types";

type TDatabricksSecretSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const DATABRICKS_SCOPE_SECRET_LIMIT = 1000;

const listDatabricksSecrets = async ({ workspaceUrl, scope, accessToken }: TDatabricksListSecretKeys) => {
  const { data } = await request.get<TDatabricksListSecretKeysResponse>(
    `${removeTrailingSlash(workspaceUrl)}/api/2.0/secrets/list`,
    {
      params: {
        scope
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  // not present in response if no secrets exist in scope
  return data.secrets ?? [];
};
const putDatabricksSecret = async ({ workspaceUrl, scope, key, value, accessToken }: TDatabricksPutSecret) =>
  request.post(
    `${removeTrailingSlash(workspaceUrl)}/api/2.0/secrets/put`,
    {
      scope,
      key,
      string_value: value
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

const deleteDatabricksSecrets = async ({ workspaceUrl, scope, key, accessToken }: TDatabricksDeleteSecret) =>
  request.post(
    `${removeTrailingSlash(workspaceUrl)}/api/2.0/secrets/delete`,
    {
      scope,
      key
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

export const databricksSyncFactory = ({ kmsService, appConnectionDAL }: TDatabricksSecretSyncFactoryDeps) => {
  const syncSecrets = async (secretSync: TDatabricksSyncWithCredentials, secretMap: TSecretMap) => {
    if (Object.keys(secretSync).length > DATABRICKS_SCOPE_SECRET_LIMIT) {
      throw new Error(
        `Databricks does not support storing more than ${DATABRICKS_SCOPE_SECRET_LIMIT} secrets per scope.`
      );
    }

    const {
      destinationConfig: { scope },
      connection
    } = secretSync;

    const { workspaceUrl } = connection.credentials;

    const accessToken = await getDatabricksConnectionAccessToken(connection, appConnectionDAL, kmsService);

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      try {
        await putDatabricksSecret({
          key,
          value,
          workspaceUrl,
          scope,
          accessToken
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    const databricksSecretKeys = await listDatabricksSecrets({
      workspaceUrl,
      scope,
      accessToken
    });

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const secret of databricksSecretKeys) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(secret.key, secretSync.syncOptions.keySchema)) continue;

      if (!(secret.key in secretMap)) {
        await deleteDatabricksSecrets({
          key: secret.key,
          workspaceUrl,
          scope,
          accessToken
        });
      }
    }
  };

  const removeSecrets = async (secretSync: TDatabricksSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { scope },
      connection
    } = secretSync;

    const { workspaceUrl } = connection.credentials;

    const accessToken = await getDatabricksConnectionAccessToken(connection, appConnectionDAL, kmsService);

    const databricksSecretKeys = await listDatabricksSecrets({
      workspaceUrl,
      scope,
      accessToken
    });

    for await (const secret of databricksSecretKeys) {
      if (secret.key in secretMap) {
        await deleteDatabricksSecrets({
          key: secret.key,
          workspaceUrl,
          scope,
          accessToken
        });
      }
    }
  };

  const getSecrets = async (secretSync: TDatabricksSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  };

  return {
    syncSecrets,
    removeSecrets,
    getSecrets
  };
};
