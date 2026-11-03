import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TDatabricksGatewayDeps } from "@app/services/app-connection/databricks";
import {
  databricksRequest,
  getDatabricksConnectionAccessToken,
  getDatabricksGatewayDetails
} from "@app/services/app-connection/databricks/databricks-connection-fns";
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

import { TSecretSyncPayload } from "../secret-sync-payload";

type TDatabricksSecretSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

const DATABRICKS_SCOPE_SECRET_LIMIT = 1000;

const listDatabricksSecrets = async (
  { connection, gatewayDetails, scope, accessToken }: TDatabricksListSecretKeys,
  deps: TDatabricksGatewayDeps
) => {
  const data = await databricksRequest<TDatabricksListSecretKeysResponse>(
    connection,
    {
      method: "GET",
      path: "/api/2.0/secrets/list",
      params: {
        scope
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    },
    deps,
    gatewayDetails
  );

  // not present in response if no secrets exist in scope
  return data.secrets ?? [];
};
const putDatabricksSecret = async (
  { connection, gatewayDetails, scope, key, value, accessToken }: TDatabricksPutSecret,
  deps: TDatabricksGatewayDeps
) =>
  databricksRequest(
    connection,
    {
      method: "POST",
      path: "/api/2.0/secrets/put",
      data: {
        scope,
        key,
        string_value: value
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    },
    deps,
    gatewayDetails
  );

const deleteDatabricksSecrets = async (
  { connection, gatewayDetails, scope, key, accessToken }: TDatabricksDeleteSecret,
  deps: TDatabricksGatewayDeps
) =>
  databricksRequest(
    connection,
    {
      method: "POST",
      path: "/api/2.0/secrets/delete",
      data: {
        scope,
        key
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    },
    deps,
    gatewayDetails
  );

export const databricksSyncFactory = ({
  kmsService,
  appConnectionDAL,
  gatewayV2Service,
  gatewayPoolService
}: TDatabricksSecretSyncFactoryDeps) => {
  const deps = { gatewayV2Service };

  // resolved once per run so every request goes through the same pool member and reuses one signed client
  // certificate instead of generating a key pair per secret
  const $resolveGatewayConnection = async (syncConnection: TDatabricksSyncWithCredentials["connection"]) => {
    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: syncConnection.gatewayId,
      gatewayPoolId: syncConnection.gatewayPoolId
    });

    const connection = { ...syncConnection, gatewayId, gatewayPoolId: null };
    const gatewayDetails = gatewayId
      ? await getDatabricksGatewayDetails(connection, gatewayId, gatewayV2Service)
      : undefined;

    return { connection, gatewayDetails };
  };

  const syncSecrets = async (secretSync: TDatabricksSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    if (Object.keys(secretSync).length > DATABRICKS_SCOPE_SECRET_LIMIT) {
      throw new Error(
        `Databricks does not support storing more than ${DATABRICKS_SCOPE_SECRET_LIMIT} secrets per scope.`
      );
    }

    const {
      destinationConfig: { scope }
    } = secretSync;

    const gateway = await $resolveGatewayConnection(secretSync.connection);

    const accessToken = await getDatabricksConnectionAccessToken(
      gateway.connection,
      appConnectionDAL,
      kmsService,
      deps
    );

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      try {
        await putDatabricksSecret(
          {
            key,
            value,
            ...gateway,
            scope,
            accessToken
          },
          deps
        );
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    const databricksSecretKeys = await listDatabricksSecrets(
      {
        ...gateway,
        scope,
        accessToken
      },
      deps
    );

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const secret of databricksSecretKeys) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(secret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      if (!(secret.key in secretMap)) {
        await deleteDatabricksSecrets(
          {
            key: secret.key,
            ...gateway,
            scope,
            accessToken
          },
          deps
        );
      }
    }
  };

  const removeSecrets = async (secretSync: TDatabricksSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      destinationConfig: { scope }
    } = secretSync;

    const gateway = await $resolveGatewayConnection(secretSync.connection);

    const accessToken = await getDatabricksConnectionAccessToken(
      gateway.connection,
      appConnectionDAL,
      kmsService,
      deps
    );

    const databricksSecretKeys = await listDatabricksSecrets(
      {
        ...gateway,
        scope,
        accessToken
      },
      deps
    );

    for await (const secret of databricksSecretKeys) {
      if (secret.key in secretMap) {
        await deleteDatabricksSecrets(
          {
            key: secret.key,
            ...gateway,
            scope,
            accessToken
          },
          deps
        );
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
