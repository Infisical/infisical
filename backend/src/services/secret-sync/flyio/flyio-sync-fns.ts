import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import {
  TDeleteFlyioVariable,
  TFlyioListVariables,
  TFlyioSecret,
  TFlyioSyncWithCredentials,
  TPutFlyioVariable
} from "@app/services/secret-sync/flyio/flyio-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const getAppName = async ({
  accessToken,
  appId,
  appName
}: {
  accessToken: string;
  appId: string;
  appName?: string;
}) => {
  if (appName) return appName;

  const { data } = await request.post<{ data: { app: { name: string } } }>(
    IntegrationUrls.FLYIO_API_URL,
    {
      query: "query GetAppName($appId: String!) { app(id: $appId) { name } }",
      variables: { appId }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  return data.data.app.name;
};

const restartAppMachines = async (secretSync: TFlyioSyncWithCredentials) => {
  const {
    connection: {
      credentials: { accessToken }
    },
    destinationConfig: { appId, appName }
  } = secretSync;

  const appNameResolved = await getAppName({ accessToken, appId, appName });

  const { data: machinesData } = await request.get<{ id: string }[]>(
    `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appNameResolved}/machines`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  const machines = Array.isArray(machinesData) ? machinesData : [];
  if (machines.length === 0) return;

  await Promise.all(
    machines.map((machine) =>
      request.post(
        `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appNameResolved}/machines/${machine.id}/restart`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          }
        }
      )
    )
  );
};

const listFlyioSecrets = async ({ accessToken, appId }: TFlyioListVariables) => {
  const { data } = await request.post<{ data: { app: { secrets: TFlyioSecret[] } } }>(
    IntegrationUrls.FLYIO_API_URL,
    {
      query: "query GetAppSecrets($appId: String!) { app(id: $appId) { id name secrets { name createdAt } } }",
      variables: { appId }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  return data.data.app.secrets.map((s) => s.name);
};

const putFlyioSecrets = async ({ accessToken, appId, secretMap }: TPutFlyioVariable) => {
  return request.post(
    IntegrationUrls.FLYIO_API_URL,
    {
      query:
        "mutation SetAppSecrets($appId: ID!, $secrets: [SecretInput!]!) { setSecrets(input: { appId: $appId, secrets: $secrets }) { app { name } release { version } } }",
      variables: {
        appId,
        secrets: Object.entries(secretMap).map(([key, { value }]) => ({ key, value }))
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
};

const deleteFlyioSecrets = async ({ accessToken, appId, keys }: TDeleteFlyioVariable) => {
  return request.post(
    IntegrationUrls.FLYIO_API_URL,
    {
      query:
        "mutation UnsetAppSecrets($appId: ID!, $keys: [String!]!) { unsetSecrets(input: { appId: $appId, keys: $keys }) { app { name } release { version } } }",
      variables: {
        appId,
        keys
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
};

export const FlyioSyncFns = {
  syncSecrets: async (secretSync: TFlyioSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      environment,
      destinationConfig: { appId }
    } = secretSync;

    const { accessToken } = connection.credentials;

    try {
      await putFlyioSecrets({ accessToken, appId, secretMap });
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }

    if (!secretSync.syncOptions.disableSecretDeletion) {
      const secrets = await listFlyioSecrets({ accessToken, appId });

      const keys = secrets.filter(
        (secret) =>
          matchesSchema(secret, environment?.slug || "", secretSync.syncOptions.keySchema) && !(secret in secretMap)
      );

      try {
        await deleteFlyioSecrets({ accessToken, appId, keys });
      } catch (error) {
        throw new SecretSyncError({
          error
        });
      }
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await restartAppMachines(secretSync);
    }
  },
  removeSecrets: async (secretSync: TFlyioSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { appId }
    } = secretSync;

    const { accessToken } = connection.credentials;

    const secrets = await listFlyioSecrets({ accessToken, appId });

    const keys = secrets.filter((secret) => secret in secretMap);

    try {
      await deleteFlyioSecrets({ accessToken, appId, keys });
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await restartAppMachines(secretSync);
    }
  },
  getSecrets: async (secretSync: TFlyioSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
