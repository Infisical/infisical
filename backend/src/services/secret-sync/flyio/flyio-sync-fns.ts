/* eslint-disable no-await-in-loop */
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
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const getAppNameByAppId = async ({ accessToken, appId }: TFlyioListVariables) => {
  const { data } = await request.post<{ data: { app: { name: string } | null }; errors?: Array<{ message: string }> }>(
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

  const body = data as { data?: { app?: { name: string } | null }; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new SecretSyncError({ message: `Fly.io app lookup failed: ${body.errors.map((e) => e.message).join("; ")}` });
  }
  const appName = body.data?.app?.name;
  if (!appName) {
    throw new SecretSyncError({ message: `Fly.io app lookup returned no app for id "${appId}"` });
  }
  return appName;
};

const FLYIO_MACHINE_WAIT_TIMEOUT_SECONDS = 60;

type TFlyioMachineListItem = {
  id: string;
  state?: string;
  region?: string;
  config?: Record<string, unknown>;
};

function parseMachinesListResponse(data: unknown): TFlyioMachineListItem[] {
  if (!Array.isArray(data)) return [];
  return data as TFlyioMachineListItem[];
}

/** Fetch all machines for the app. App-level list returns a single array (no pagination). */
async function listAllMachines(
  machinesApiBase: string,
  headers: Record<string, string>
): Promise<TFlyioMachineListItem[]> {
  const { data: raw } = await request.get<unknown>(machinesApiBase, { headers });
  return parseMachinesListResponse(raw);
}

/**
 * Deploy secrets to machines: update each machine with the new secrets version so they
 * boot with at least that version of the app secrets.
 */
const deployAppMachines = async (
  secretSync: TFlyioSyncWithCredentials,
  secretsVersion: number | undefined,
  appName?: string
) => {
  const {
    connection: {
      credentials: { accessToken }
    },
    destinationConfig: { appId }
  } = secretSync;

  const appNameResolved = appName ?? (await getAppNameByAppId({ accessToken, appId }));

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  const machinesApiBase = `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appNameResolved}/machines`;

  const machineList = await listAllMachines(machinesApiBase, headers);
  const toUpdate = machineList.filter((m) => m.state !== "destroyed" && m.state !== "destroying");
  if (toUpdate.length === 0) return;

  for (const machine of toUpdate) {
    const { region, config } = machine;
    if (region && config != null) {
      const body: {
        config: Record<string, unknown>;
        region: string;
        skip_launch?: boolean;
        min_secrets_version?: number;
      } = {
        config,
        region
      };
      if (secretsVersion != null) {
        body.min_secrets_version = secretsVersion;
      }
      body.skip_launch = false;

      await request.post(`${machinesApiBase}/${machine.id}`, body, { headers });
      await request.get(
        `${machinesApiBase}/${machine.id}/wait?state=started&timeout=${FLYIO_MACHINE_WAIT_TIMEOUT_SECONDS}`,
        { headers }
      );
    }
  }
};

const listFlyioSecrets = async ({ accessToken, appId }: TFlyioListVariables) => {
  // Keep using GraphQL for listing — the Machines REST API list endpoint
  // has known issues (returns empty arrays in some cases).
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

type TFlyioMachinesSecretsResponse = {
  secrets: Array<{ name: string }>;
  version: number;
};

// Use the Machines API POST /apps/{appName}/secrets to set app secrets.
// The response includes a `version` that is the correct min_secrets_version
// for machine updates. The GraphQL setSecrets mutation returns a release
// version, which is a different versioning scheme and can cause machines to
// boot with stale secrets.
// Object.create(null) prevents __proto__ from being swallowed as a secret name.
const putFlyioSecrets = async ({ accessToken, appName, secretMap }: TPutFlyioVariable) => {
  const values: Record<string, string> = Object.create(null);
  for (const [key, { value }] of Object.entries(secretMap)) {
    values[key] = value;
  }

  const { data } = await request.post<TFlyioMachinesSecretsResponse>(
    `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appName}/secrets`,
    { values },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  return data.version;
};

// Same Machines API endpoint as putFlyioSecrets; null values delete keys.
// Returns the secrets version for use as min_secrets_version in deploys.
const deleteFlyioSecrets = async ({ accessToken, appName, keys }: TDeleteFlyioVariable) => {
  if (keys.length === 0) return;

  const values: Record<string, null> = Object.create(null);
  for (const key of keys) {
    values[key] = null;
  }

  const { data } = await request.post<TFlyioMachinesSecretsResponse>(
    `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appName}/secrets`,
    { values },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  return data.version;
};

export const FlyioSyncFns = {
  syncSecrets: async (secretSync: TFlyioSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      connection,
      environment,
      destinationConfig: { appId }
    } = secretSync;

    const { accessToken } = connection.credentials;
    const appName = await getAppNameByAppId({ accessToken, appId });

    let secretsVersion: number | undefined;
    try {
      secretsVersion = await putFlyioSecrets({ accessToken, appName, secretMap });
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
        const deleteVersion = await deleteFlyioSecrets({ accessToken, appName, keys });
        if (deleteVersion != null) secretsVersion = deleteVersion;
      } catch (error) {
        throw new SecretSyncError({
          error
        });
      }
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await deployAppMachines(secretSync, secretsVersion, appName);
    }
  },
  removeSecrets: async (secretSync: TFlyioSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      connection,
      destinationConfig: { appId }
    } = secretSync;

    const { accessToken } = connection.credentials;
    const appName = await getAppNameByAppId({ accessToken, appId });

    const secrets = await listFlyioSecrets({ accessToken, appId });

    const keys = secrets.filter((secret) => secret in secretMap);

    let secretsVersion: number | undefined;
    try {
      secretsVersion = await deleteFlyioSecrets({ accessToken, appName, keys });
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await deployAppMachines(secretSync, secretsVersion, appName);
    }
  },
  getSecrets: async (secretSync: TFlyioSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
