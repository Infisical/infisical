import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  TTriggerDevImportEnvVarsRequest,
  TTriggerDevListEnvVarsResponse,
  TTriggerDevSyncWithCredentials
} from "./trigger-dev-sync-types";

const DEFAULT_TRIGGER_DEV_API_URL = "https://api.trigger.dev";

const getNormalizedApiUrl = async (apiUrl?: string) => {
  const normalized = removeTrailingSlash(apiUrl || DEFAULT_TRIGGER_DEV_API_URL);
  await blockLocalAndPrivateIpAddresses(normalized);
  return normalized;
};

const listTriggerDevEnvVars = async (
  apiUrl: string | undefined,
  apiToken: string,
  projectRef: string,
  environment: string
) => {
  const normalized = await getNormalizedApiUrl(apiUrl);
  const { data } = await request.get<TTriggerDevListEnvVarsResponse>(
    `${normalized}/api/v1/projects/${projectRef}/envvars/${environment}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    }
  );

  return data.variables;
};

const importTriggerDevEnvVars = async (
  apiUrl: string | undefined,
  apiToken: string,
  projectRef: string,
  environment: string,
  payload: TTriggerDevImportEnvVarsRequest
) => {
  const normalized = await getNormalizedApiUrl(apiUrl);

  await request.post<void>(
    `${normalized}/api/v1/projects/${projectRef}/envvars/${environment}/import`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    }
  );
};

const deleteTriggerDevEnvVar = async (
  apiUrl: string | undefined,
  apiToken: string,
  projectRef: string,
  environment: string,
  name: string
) => {
  const normalized = await getNormalizedApiUrl(apiUrl);

  await request.delete<void>(
    `${normalized}/api/v1/projects/${projectRef}/envvars/${environment}/${encodeURIComponent(name)}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    }
  );
};

export const TriggerDevSyncFns = {
  syncSecrets: async (secretSync: TTriggerDevSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { projectRef, environment: triggerEnvironment },
      connection: {
        credentials: { apiToken, apiUrl }
      },
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const existing = await listTriggerDevEnvVars(apiUrl, apiToken, projectRef, triggerEnvironment);

    const variables: Record<string, string> = Object.fromEntries(
      Object.keys(secretMap).map((key) => [key, secretMap[key].value ?? ""])
    );

    if (Object.keys(variables).length > 0) {
      try {
        await importTriggerDevEnvVars(apiUrl, apiToken, projectRef, triggerEnvironment, {
          variables,
          override: true
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: Object.keys(variables)[0]
        });
      }
    }

    if (!disableSecretDeletion) {
      for (const key of Object.keys(existing)) {
        if (matchesSchema(key, environment?.slug || "", keySchema) && !secretMap[key]) {
          try {
            await deleteTriggerDevEnvVar(apiUrl, apiToken, projectRef, triggerEnvironment, key);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        }
      }
    }
  },

  removeSecrets: async (secretSync: TTriggerDevSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { projectRef, environment: triggerEnvironment },
      connection: {
        credentials: { apiToken, apiUrl }
      }
    } = secretSync;

    const existing = await listTriggerDevEnvVars(apiUrl, apiToken, projectRef, triggerEnvironment);

    for (const key of Object.keys(secretMap)) {
      if (!(key in existing)) continue;

      try {
        await deleteTriggerDevEnvVar(apiUrl, apiToken, projectRef, triggerEnvironment, key);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }
  },

  getSecrets: async (secretSync: TTriggerDevSyncWithCredentials): Promise<TSecretMap> => {
    const {
      destinationConfig: { projectRef, environment: triggerEnvironment },
      connection: {
        credentials: { apiToken, apiUrl }
      }
    } = secretSync;

    const envVars = await listTriggerDevEnvVars(apiUrl, apiToken, projectRef, triggerEnvironment);

    return Object.fromEntries(Object.entries(envVars).map(([key, value]) => [key, { value }]));
  }
};
