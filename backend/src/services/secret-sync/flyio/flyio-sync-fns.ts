/* eslint-disable no-await-in-loop */
import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import {
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

const getAppNameByAppId = async ({ accessToken, appId }: TFlyioListVariables) => {
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
 */
const deployAppMachines = async (secretSync: TFlyioSyncWithCredentials, releaseVersion: number | undefined) => {
  const {
    connection: {
      credentials: { accessToken }
    },
    destinationConfig: { appId }
  } = secretSync;

  const appNameResolved = await getAppNameByAppId({ accessToken, appId });

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
      if (releaseVersion != null) {
        body.min_secrets_version = releaseVersion;
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

// App secrets (NAME=VALUE env vars) must be set via the GraphQL API. The
// Machines API POST /apps/{name}/secrets is for KMS/secret-key types, not
// plain app secrets — see https://community.fly.io/t/how-to-create-secrets-via-the-machine-api/24603
const putFlyioSecrets = async ({ accessToken, appId, secretMap }: TPutFlyioVariable) => {
  const response = await request.post<FlyioGraphQLResponse<{ setSecrets?: { release?: { version: number } } }>>(
    IntegrationUrls.FLYIO_API_URL,
    {
      query: `
        mutation SetAppSecrets($appId: ID!, $secrets: [SecretInput!]!) {
          setSecrets(input: { appId: $appId, secrets: $secrets }) {
            release { version }
          }
        }
      `,
      variables: {
        appId,
        secrets: Object.entries(secretMap).map(([key, { value }]) => ({ key, value }))
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  const body = response.data as FlyioGraphQLResponse<{
    setSecrets?: { release?: { version: number } };
  }>;
  if (body.errors?.length) {
    const messages = body.errors.map((e) => e.message).join("; ");
    throw new SecretSyncError({ message: `Fly.io setSecrets failed: ${messages}` });
  }
  return body.data?.setSecrets?.release?.version;
};

// Use GraphQL unsetSecrets so keys are sent in the request body (no URL encoding issues).
// Returns release.version when present (for auto-redeploy); Fly may return null.
const deleteFlyioSecrets = async ({ accessToken, appId, keys }: TDeleteFlyioVariable) => {
  if (keys.length === 0) return;

  const response = await request.post<FlyioGraphQLResponse<{ unsetSecrets?: { release?: { version: number } } }>>(
    IntegrationUrls.FLYIO_API_URL,
    {
      query: `
        mutation UnsetAppSecrets($appId: ID!, $keys: [String!]!) {
          unsetSecrets(input: { appId: $appId, keys: $keys }) {
            release { version }
          }
        }
      `,
      variables: { appId, keys }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  const body = response.data as FlyioGraphQLResponse<{
    unsetSecrets?: { release?: { version: number } };
  }>;
  if (body.errors?.length) {
    const messages = body.errors.map((e) => e.message).join("; ");
    throw new SecretSyncError({ message: `Fly.io unsetSecrets failed: ${messages}` });
  }
  return body.data?.unsetSecrets?.release?.version;
};

export const FlyioSyncFns = {
  syncSecrets: async (secretSync: TFlyioSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      environment,
      destinationConfig: { appId }
    } = secretSync;

    const { accessToken } = connection.credentials;

    let releaseVersion: number | undefined;
    try {
      releaseVersion = await putFlyioSecrets({ accessToken, appId, secretMap });
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
      await deployAppMachines(secretSync, releaseVersion);
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

    let releaseVersion: number | undefined;
    try {
      releaseVersion = await deleteFlyioSecrets({ accessToken, appId, keys });
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }

    if (secretSync.syncOptions.autoRedeploy) {
      await deployAppMachines(secretSync, releaseVersion);
    }
  },
  getSecrets: async (secretSync: TFlyioSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
