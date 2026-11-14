import { isAxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";
import {
  getConvexDeploymentHeaders,
  getConvexDeploymentUrl,
  getConvexErrorMessage
} from "@app/services/app-connection/convex";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { CONVEX_ENV_VAR_NAME_RULE, isValidConvexEnvVarName } from "./convex-sync-constants";
import { TConvexEnvVarChange, TConvexSyncWithCredentials } from "./convex-sync-types";

type TConvexDeploymentApi = { apiUrl: string; headers: Record<string, string> };

const toSyncError = (error: unknown, message: string) => {
  // A refused private address or a deployment Infisical cannot reach is a configuration problem a retry will not fix
  if (error instanceof BadRequestError) {
    return new SecretSyncError({ message: error.message, shouldRetry: false });
  }

  const status = isAxiosError(error) ? error.response?.status : undefined;

  // Convex answers what it will never accept (a bad name or value, the variable limit, an unknown deployment) with a
  // 4xx, so retrying only delays the failure
  return new SecretSyncError({
    message: `${message}: ${getConvexErrorMessage(error)}`,
    shouldRetry: !(status && [400, 401, 403, 404].includes(status))
  });
};

const getConvexDeploymentApi = async ({
  connection,
  destinationConfig: { deploymentName }
}: TConvexSyncWithCredentials): Promise<TConvexDeploymentApi> => {
  try {
    const deploymentUrl = await getConvexDeploymentUrl(connection, deploymentName);

    return {
      apiUrl: `${deploymentUrl}/api/v1`,
      headers: getConvexDeploymentHeaders(connection.credentials.accessToken)
    };
  } catch (error) {
    throw toSyncError(error, `Failed to find Convex deployment '${deploymentName}'`);
  }
};

const listConvexEnvVars = async ({ apiUrl, headers }: TConvexDeploymentApi) => {
  try {
    const { data } = await safeRequest.get<{ environmentVariables: Record<string, string> }>(
      `${apiUrl}/list_environment_variables`,
      { headers }
    );

    return data.environmentVariables;
  } catch (error) {
    throw toSyncError(error, "Failed to list Convex environment variables");
  }
};

// Convex applies the whole batch in one transaction, so a run either writes every change or none
const updateConvexEnvVars = async ({ apiUrl, headers }: TConvexDeploymentApi, changes: TConvexEnvVarChange[]) => {
  if (!changes.length) return;

  try {
    await safeRequest.post(`${apiUrl}/update_environment_variables`, { changes }, { headers });
  } catch (error) {
    throw toSyncError(error, "Failed to update Convex environment variables");
  }
};

export const ConvexSyncFns = {
  async getSecrets(secretSync: TConvexSyncWithCredentials): Promise<TSecretMap> {
    const envVars = await listConvexEnvVars(await getConvexDeploymentApi(secretSync));

    return Object.fromEntries(Object.entries(envVars).map(([key, value]) => [key, { value }]));
  },

  async syncSecrets(secretSync: TConvexSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    // Rejected up front so the message names every offending key, instead of Convex refusing the batch on the first
    const invalidKeys = Object.keys(secretMap).filter((key) => !isValidConvexEnvVarName(key));
    if (invalidKeys.length) {
      throw new SecretSyncError({
        secretKey: invalidKeys[0],
        shouldRetry: false,
        message: `${invalidKeys.length} secret ${
          invalidKeys.length === 1 ? "key is" : "keys are"
        } not a valid Convex environment variable name: ${invalidKeys.join(", ")}. ${CONVEX_ENV_VAR_NAME_RULE}`
      });
    }

    const deploymentApi = await getConvexDeploymentApi(secretSync);
    const envVars = await listConvexEnvVars(deploymentApi);

    const changes: TConvexEnvVarChange[] = Object.entries(secretMap)
      .filter(([name, { value }]) => !Object.hasOwn(envVars, name) || envVars[name] !== value)
      .map(([name, { value }]) => ({ name, value }));

    if (!disableSecretDeletion) {
      for (const name of Object.keys(envVars)) {
        if (!Object.hasOwn(secretMap, name) && matchesSchema(name, environment?.slug || "", keySchema)) {
          changes.push({ name, value: null });
        }
      }
    }

    await updateConvexEnvVars(deploymentApi, changes);
  },

  async removeSecrets(secretSync: TConvexSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const deploymentApi = await getConvexDeploymentApi(secretSync);
    const envVars = await listConvexEnvVars(deploymentApi);

    await updateConvexEnvVars(
      deploymentApi,
      Object.keys(secretMap)
        .filter((name) => Object.hasOwn(envVars, name))
        .map((name) => ({ name, value: null }))
    );
  }
};
