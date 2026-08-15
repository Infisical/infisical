import { safeRequest } from "@app/lib/validator";
import { getPortainerInstanceUrl, getPortainerRequestHeaders } from "@app/services/app-connection/portainer";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import {
  TPortainerEnvVar,
  TPortainerStackFileResponse,
  TPortainerStackResponse,
  TPortainerSyncWithCredentials
} from "./portainer-sync-types";

const getPortainerClientDetails = (secretSync: TPortainerSyncWithCredentials) => {
  const { connection, destinationConfig } = secretSync;

  return {
    instanceUrl: getPortainerInstanceUrl(connection),
    headers: getPortainerRequestHeaders(connection.credentials.apiToken),
    environmentId: destinationConfig.environmentId,
    stackId: destinationConfig.stackId
  };
};

const getPortainerStack = async (secretSync: TPortainerSyncWithCredentials): Promise<TPortainerStackResponse> => {
  const { instanceUrl, headers, stackId } = getPortainerClientDetails(secretSync);

  try {
    const { data } = await safeRequest.get<TPortainerStackResponse>(`${instanceUrl}/api/stacks/${stackId}`, {
      headers
    });

    return data;
  } catch (error) {
    throw new SecretSyncError({ error });
  }
};

/**
 * Stack environment variables are stored as a single list, so every write replaces the whole
 * list. Git-backed stacks store it without redeploying; file-based stacks require the compose
 * file on every update and redeploy as a result.
 */
const writeStackEnv = async (
  secretSync: TPortainerSyncWithCredentials,
  stack: TPortainerStackResponse,
  env: TPortainerEnvVar[]
) => {
  const { instanceUrl, headers, environmentId, stackId } = getPortainerClientDetails(secretSync);

  try {
    if (stack.GitConfig?.URL) {
      // The Git settings are replaced wholesale, so the existing reference and auto-update config are echoed back
      await safeRequest.post(
        `${instanceUrl}/api/stacks/${stackId}/git?endpointId=${environmentId}`,
        {
          env,
          repositoryReferenceName: stack.GitConfig.ReferenceName,
          autoUpdate: stack.AutoUpdate ?? null,
          prune: false
        },
        { headers }
      );

      return;
    }

    const { data } = await safeRequest.get<TPortainerStackFileResponse>(`${instanceUrl}/api/stacks/${stackId}/file`, {
      headers
    });

    await safeRequest.put(
      `${instanceUrl}/api/stacks/${stackId}?endpointId=${environmentId}`,
      {
        env,
        stackFileContent: data.StackFileContent,
        prune: false,
        pullImage: false
      },
      { headers }
    );
  } catch (error) {
    throw new SecretSyncError({ error });
  }
};

const toEnvVars = (secretMap: TSecretMap): TPortainerEnvVar[] =>
  Object.entries(secretMap).map(([name, secret]) => ({ name, value: secret.value ?? "" }));

export const PortainerSyncFns = {
  async getSecrets(secretSync: TPortainerSyncWithCredentials): Promise<TSecretMap> {
    const stack = await getPortainerStack(secretSync);

    return Object.fromEntries((stack.Env ?? []).map(({ name, value }) => [name, { value: value ?? "" }]));
  },

  async syncSecrets(secretSync: TPortainerSyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const stack = await getPortainerStack(secretSync);

    const retainedEnv = (stack.Env ?? []).filter(({ name }) => {
      if (name in secretMap) return false;

      // Only remove keys managed by this sync (respecting the configured key schema)
      if (!disableSecretDeletion && matchesSchema(name, environment?.slug || "", keySchema)) return false;

      return true;
    });

    await writeStackEnv(secretSync, stack, [...retainedEnv, ...toEnvVars(secretMap)]);
  },

  async removeSecrets(secretSync: TPortainerSyncWithCredentials, secretMap: TSecretMap) {
    const stack = await getPortainerStack(secretSync);

    const remainingEnv = (stack.Env ?? []).filter(({ name }) => !(name in secretMap));

    await writeStackEnv(secretSync, stack, remainingEnv);
  }
};
