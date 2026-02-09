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

const FLYIO_MACHINE_WAIT_TIMEOUT_SECONDS = 60;

type TFlyioMachineListItem = {
  id: string;
  state?: string;
  region?: string;
  config?: Record<string, unknown>;
};

/** GET /apps/{name}/machines can return a raw array or { machines: [], next_cursor?: string } */
function parseMachinesListResponse(data: unknown): TFlyioMachineListItem[] {
  if (Array.isArray(data)) return data as TFlyioMachineListItem[];
  if (
    data &&
    typeof data === "object" &&
    "machines" in data &&
    Array.isArray((data as { machines: unknown }).machines)
  ) {
    return (data as { machines: TFlyioMachineListItem[] }).machines;
  }
  return [];
}

/** Fetch all machines for the app, handling list shape and pagination */
async function listAllMachines(
  machinesApiBase: string,
  headers: Record<string, string>
): Promise<TFlyioMachineListItem[]> {
  const all: TFlyioMachineListItem[] = [];
  let cursor: string | undefined;
  do {
    const url = cursor ? `${machinesApiBase}?cursor=${encodeURIComponent(cursor)}` : machinesApiBase;
    // eslint-disable-next-line no-await-in-loop -- pagination requires sequential requests
    const { data: raw } = await request.get<unknown>(url, { headers });
    const page = parseMachinesListResponse(raw);
    all.push(...page);
    const obj = raw && typeof raw === "object" && "next_cursor" in raw ? (raw as { next_cursor?: string }) : null;
    cursor = obj?.next_cursor;
  } while (cursor);
  return all;
}

/**
 * Deploy secrets to machines: update each machine with the new secrets version so they
 * reboot and pick up secrets, and Fly marks the release as "deployed". Uses GET per
 * machine then POST update with full config + min_secrets_version so we never send
 * partial config (which can leave a machine stopped or broken).
 */
const deployAppMachines = async (secretSync: TFlyioSyncWithCredentials, releaseVersion: number | undefined) => {
  const {
    connection: {
      credentials: { accessToken }
    },
    destinationConfig: { appId, appName }
  } = secretSync;

  const appNameResolved = await getAppName({ accessToken, appId, appName });

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  const machinesApiBase = `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appNameResolved}/machines`;

  const machineList = await listAllMachines(machinesApiBase, headers);
  const toUpdate = machineList.filter((m) => m.state !== "destroyed" && m.state !== "destroying");
  if (toUpdate.length === 0) return;

  for (const item of toUpdate) {
    // eslint-disable-next-line no-await-in-loop -- update then wait started per machine to avoid leaving any down
    const { data: machine } = await request.get<{
      id: string;
      state: string;
      region: string;
      config: Record<string, unknown>;
    }>(`${machinesApiBase}/${item.id}`, { headers });

    const body: {
      config: Record<string, unknown>;
      region: string;
      skip_launch?: boolean;
      min_secrets_version?: number;
    } = {
      config: machine.config ?? {},
      region: machine.region
    };
    if (releaseVersion != null) {
      body.min_secrets_version = releaseVersion;
    }
    body.skip_launch = false;

    // eslint-disable-next-line no-await-in-loop -- update then wait started per machine to avoid leaving any down
    await request.post(`${machinesApiBase}/${machine.id}`, body, { headers });

    // eslint-disable-next-line no-await-in-loop -- wait for this machine to be started before next
    await request.get(
      `${machinesApiBase}/${machine.id}/wait?state=started&timeout=${FLYIO_MACHINE_WAIT_TIMEOUT_SECONDS}`,
      { headers }
    );
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

// Use the Machines REST API (DELETE /apps/{name}/secrets/{key}) instead of
// GraphQL. Returns the updated secrets version.
const deleteFlyioSecrets = async ({ accessToken, appId, keys }: TDeleteFlyioVariable) => {
  if (keys.length === 0) return;

  const appName = await getAppName({ accessToken, appId });

  let lastVersion: number | undefined;
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop -- sequential deletes to capture last Version
    const { data } = await request.delete<{ Version: number }>(
      `${IntegrationUrls.FLYIO_MACHINES_API_URL}/apps/${appName}/secrets/${key}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    lastVersion = data.Version;
  }

  return lastVersion;
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
