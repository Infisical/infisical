import { request } from "@app/lib/config/request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { HerokuConnectionMethod, refreshHerokuToken, THerokuConnection } from "@app/services/app-connection/heroku";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import {
  THerokuConfigVars,
  THerokuListVariables,
  THerokuSyncWithCredentials,
  THerokuUpdateVariables
} from "@app/services/secret-sync/heroku/heroku-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

type THerokuSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const getValidAuthToken = async (
  connection: THerokuConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<string> => {
  if (
    connection.method === HerokuConnectionMethod.OAuth &&
    connection.credentials.refreshToken &&
    connection.credentials.expiresAt < new Date()
  ) {
    const authToken = await refreshHerokuToken(
      connection.credentials.refreshToken,
      connection.id,
      connection.orgId,
      appConnectionDAL,
      kmsService
    );
    return authToken;
  }
  return connection.credentials.authToken;
};

const getHerokuConfigVars = async ({ authToken, app }: THerokuListVariables): Promise<THerokuConfigVars> => {
  const { data } = await request.get<THerokuConfigVars>(
    `${IntegrationUrls.HEROKU_API_URL}/apps/${encodeURIComponent(app)}/config-vars`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: "application/vnd.heroku+json; version=3"
      }
    }
  );

  return data;
};

const updateHerokuConfigVars = async ({ authToken, app, configVars }: THerokuUpdateVariables) => {
  return request.patch(`${IntegrationUrls.HEROKU_API_URL}/apps/${encodeURIComponent(app)}/config-vars`, configVars, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/vnd.heroku+json; version=3",
      "Content-Type": "application/json"
    }
  });
};

export const HerokuSyncFns = {
  syncSecrets: async (
    secretSync: THerokuSyncWithCredentials,
    secretMap: TSecretMap,
    { appConnectionDAL, kmsService }: THerokuSyncFactoryDeps
  ) => {
    const {
      connection,
      environment,
      destinationConfig: { app }
    } = secretSync;

    const authToken = await getValidAuthToken(connection, appConnectionDAL, kmsService);

    try {
      const updatedConfigVars: THerokuConfigVars = {};

      for (const [key, { value }] of Object.entries(secretMap)) {
        updatedConfigVars[key] = value;
      }

      if (!secretSync.syncOptions.disableSecretDeletion) {
        const currentConfigVars = await getHerokuConfigVars({ authToken, app });

        for (const key of Object.keys(currentConfigVars)) {
          if (matchesSchema(key, environment?.slug || "", secretSync.syncOptions.keySchema) && !(key in secretMap)) {
            updatedConfigVars[key] = null;
          }
        }
      }

      await updateHerokuConfigVars({
        authToken,
        app,
        configVars: updatedConfigVars
      });
    } catch (error) {
      throw new SecretSyncError({
        error,
        secretKey: "batch_update"
      });
    }
  },

  removeSecrets: async (
    secretSync: THerokuSyncWithCredentials,
    secretMap: TSecretMap,
    { appConnectionDAL, kmsService }: THerokuSyncFactoryDeps
  ) => {
    const {
      connection,
      destinationConfig: { app }
    } = secretSync;

    const authToken = await getValidAuthToken(connection, appConnectionDAL, kmsService);

    try {
      const currentConfigVars = await getHerokuConfigVars({ authToken, app });
      const configVarsToUpdate: Record<string, null> = {};

      for (const key of Object.keys(secretMap)) {
        if (key in currentConfigVars) {
          configVarsToUpdate[key] = null;
        }
      }

      if (Object.keys(configVarsToUpdate).length > 0) {
        await updateHerokuConfigVars({
          authToken,
          app,
          configVars: configVarsToUpdate
        });
      }
    } catch (error) {
      throw new SecretSyncError({
        error,
        secretKey: "batch_remove"
      });
    }
  },

  getSecrets: async (
    secretSync: THerokuSyncWithCredentials,
    { appConnectionDAL, kmsService }: THerokuSyncFactoryDeps
  ): Promise<TSecretMap> => {
    const {
      connection,
      destinationConfig: { app }
    } = secretSync;

    const authToken = await getValidAuthToken(connection, appConnectionDAL, kmsService);

    const data = await getHerokuConfigVars({ authToken, app });
    const transformed = Object.entries(data).reduce((acc, [key, value]) => {
      if (!value) {
        return acc;
      }
      acc[key] = { value };
      return acc;
    }, {} as TSecretMap);

    return transformed;
  }
};
