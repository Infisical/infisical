/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import {
  FlyioGraphQLError,
  FlyioGraphQLResponse,
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

const assertNoGraphQLErrors = <T>(response: FlyioGraphQLResponse<T>) => {
  if (response.errors?.length) {
    const messages = response.errors.map((e) => e.message).join("; ");
    throw new SecretSyncError({ message: `Fly.io API error: ${messages}` });
  }
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as { message?: string; error?: string; errors?: FlyioGraphQLError[] };
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    if (Array.isArray(data.errors) && data.errors[0]?.message) return data.errors[0].message;
    if (typeof data === "object") return JSON.stringify(data);
  }
  return error instanceof Error ? error.message : String(error);
};

const getAppName = async ({
  accessToken,
  appId,
  appName
}: {
  accessToken: string;
  appId: string;
  appName?: string;
}): Promise<string> => {
  if (appName) return appName;

  const response = await request.post<FlyioGraphQLResponse<{ app: { name: string } }>>(
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

  const body = response.data as FlyioGraphQLResponse<{ app: { name: string } }>;
  assertNoGraphQLErrors(body);
  if (!body.data?.app?.name) {
    throw new SecretSyncError({ message: "Fly.io API returned invalid response: missing app name" });
  }
  return body.data.app.name;
};

/** Machine shape from Fly.io Machines API list response (id only needed for restart) */
type FlyioMachine = { id: string };

/**
 * Restarts app machines so they pick up newly set secrets.
 * Uses Machines API restart endpoint (fire-and-forget, no wait).
 */
const restartAppMachinesForSecrets = async (secretSync: TFlyioSyncWithCredentials) => {
  const {
    connection: {
      credentials: { accessToken }
    },
    destinationConfig: { appId, appName }
  } = secretSync;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- accessToken/appId/appName from TFlyioSyncWithCredentials may be inferred as any by zod
  const appNameResolved = await getAppName({ accessToken, appId, appName });

  let machines: FlyioMachine[];
  try {
    const { data } = await request.get<FlyioMachine[]>(
      `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appNameResolved}/machines`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );
    machines = Array.isArray(data) ? data : [];
  } catch (error) {
    throw new SecretSyncError({
      message: `Failed to list Fly.io machines: ${extractErrorMessage(error)}`,
      error
    });
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  for (const machine of machines) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential restart
      await request.post(
        `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appNameResolved}/machines/${machine.id}/restart`,
        {},
        { headers }
      );
    } catch (error) {
      throw new SecretSyncError({
        message: `Failed to restart Fly.io machine ${machine.id}: ${extractErrorMessage(error)}`,
        error
      });
    }
  }
};

const listFlyioSecrets = async ({ accessToken, appId }: TFlyioListVariables) => {
  const response = await request.post<FlyioGraphQLResponse<{ app: { secrets: TFlyioSecret[] } }>>(
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

  const body = response.data as FlyioGraphQLResponse<{ app: { secrets: TFlyioSecret[] } }>;
  assertNoGraphQLErrors(body);
  return (body.data?.app?.secrets ?? []).map((s) => s.name);
};

const putFlyioSecrets = async ({ accessToken, appId, secretMap }: TPutFlyioVariable) => {
  const response = await request.post<FlyioGraphQLResponse<{ setSecrets?: unknown }>>(
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

  const body = response.data as FlyioGraphQLResponse;
  assertNoGraphQLErrors(body);
};

const deleteFlyioSecrets = async ({ accessToken, appId, keys }: TDeleteFlyioVariable) => {
  const response = await request.post<FlyioGraphQLResponse<{ unsetSecrets?: unknown }>>(
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

  const body = response.data as FlyioGraphQLResponse;
  assertNoGraphQLErrors(body);
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
        message: `Failed to sync secrets to Fly.io: ${extractErrorMessage(error)}`,
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
          message: `Failed to remove secrets from Fly.io: ${extractErrorMessage(error)}`,
          error
        });
      }
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await restartAppMachinesForSecrets(secretSync);
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
        message: `Failed to remove secrets from Fly.io: ${extractErrorMessage(error)}`,
        error
      });
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await restartAppMachinesForSecrets(secretSync);
    }
  },
  getSecrets: async (secretSync: TFlyioSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
