/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TTravisCIEnvVar, TTravisCISyncWithCredentials } from "./travis-ci-sync-types";

const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5000;
const MAX_RETRIES = 5;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type Throttle = {
  wait: () => Promise<void>;
  bumpOn429: () => void;
};

const makeThrottle = (): Throttle => {
  let currentDelayMs = BASE_DELAY_MS;
  return {
    wait: () => sleep(currentDelayMs),
    bumpOn429: () => {
      currentDelayMs = Math.min(currentDelayMs * 2, MAX_DELAY_MS);
    }
  };
};

const makeRequestWithRetry = async <T>(throttle: Throttle, requestFn: () => Promise<T>, attempt = 0): Promise<T> => {
  await throttle.wait();
  try {
    return await requestFn();
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
      throttle.bumpOn429();
      return makeRequestWithRetry(throttle, requestFn, attempt + 1);
    }
    throw error;
  }
};

const travisCIApiHeaders = (apiToken: string) => ({
  Authorization: `token ${apiToken}`,
  "Travis-API-Version": "3",
  Accept: "application/json"
});

const getRepoEnvVars = async (
  apiToken: string,
  repositoryId: string,
  throttle: Throttle
): Promise<TTravisCIEnvVar[]> => {
  const { data } = await makeRequestWithRetry(throttle, () =>
    request.get<{ env_vars: TTravisCIEnvVar[] }>(
      `${IntegrationUrls.TRAVISCI_API_URL}/repo/${encodeURIComponent(repositoryId)}/env_vars`,
      { headers: travisCIApiHeaders(apiToken) }
    )
  );

  return data?.env_vars ?? [];
};

const filterByScope = (
  envVars: TTravisCIEnvVar[],
  destinationConfig: TTravisCISyncWithCredentials["destinationConfig"]
): TTravisCIEnvVar[] => {
  if (destinationConfig.branch) {
    return envVars.filter((envVar) => envVar.branch === destinationConfig.branch);
  }

  return envVars.filter((envVar) => envVar.branch === null);
};

type TTravisCIEnvVarUpsertBody = {
  "env_var.name": string;
  "env_var.value": string;
  "env_var.public": boolean;
  "env_var.branch"?: string;
};

const upsertRepoEnvVar = async ({
  apiToken,
  repositoryId,
  existingEnvVarId,
  body,
  throttle
}: {
  apiToken: string;
  repositoryId: string;
  existingEnvVarId?: string;
  body: TTravisCIEnvVarUpsertBody;
  throttle: Throttle;
}): Promise<void> => {
  const headers = { ...travisCIApiHeaders(apiToken), "Content-Type": "application/json" };
  const encodedRepoId = encodeURIComponent(repositoryId);

  if (existingEnvVarId) {
    await makeRequestWithRetry(throttle, () =>
      request.patch(
        `${IntegrationUrls.TRAVISCI_API_URL}/repo/${encodedRepoId}/env_var/${encodeURIComponent(existingEnvVarId)}`,
        body,
        { headers }
      )
    );
    return;
  }

  await makeRequestWithRetry(throttle, () =>
    request.post(`${IntegrationUrls.TRAVISCI_API_URL}/repo/${encodedRepoId}/env_vars`, body, { headers })
  );
};

export const TravisCISyncFns = {
  async getSecrets(secretSync: TTravisCISyncWithCredentials): Promise<TSecretMap> {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TTravisCISyncWithCredentials, secretMap: TSecretMap): Promise<void> {
    const {
      connection: {
        credentials: { apiToken }
      },
      destinationConfig,
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const throttle = makeThrottle();
    const envVars = await getRepoEnvVars(apiToken, destinationConfig.repositoryId, throttle);
    const scopedEnvVars = filterByScope(envVars, destinationConfig);
    const scopedByName = Object.fromEntries(scopedEnvVars.map((envVar) => [envVar.name, envVar]));

    for (const key of Object.keys(secretMap)) {
      try {
        const entry = secretMap[key];
        const body: TTravisCIEnvVarUpsertBody = {
          "env_var.name": key,
          "env_var.value": entry.value,
          "env_var.public": false
        };

        const { branch } = destinationConfig;
        if (typeof branch === "string" && branch.length > 0) {
          body["env_var.branch"] = branch;
        }

        await upsertRepoEnvVar({
          apiToken,
          repositoryId: destinationConfig.repositoryId,
          existingEnvVarId: scopedByName[key]?.id,
          body,
          throttle
        });
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    // check if it is possible to delete in bulk

    for (const envVar of scopedEnvVars) {
      if (!matchesSchema(envVar.name, environment?.slug || "", keySchema)) continue;
      if (envVar.name in secretMap) continue;

      try {
        await makeRequestWithRetry(throttle, () =>
          request.delete(
            `${IntegrationUrls.TRAVISCI_API_URL}/repo/${encodeURIComponent(
              destinationConfig.repositoryId
            )}/env_var/${encodeURIComponent(envVar.id)}`,
            { headers: travisCIApiHeaders(apiToken) }
          )
        );
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) continue;
        throw new SecretSyncError({ error, secretKey: envVar.name });
      }
    }
  },

  async removeSecrets(secretSync: TTravisCISyncWithCredentials, secretMap: TSecretMap): Promise<void> {
    const {
      connection: {
        credentials: { apiToken }
      },
      destinationConfig
    } = secretSync;

    const throttle = makeThrottle();
    const envVars = await getRepoEnvVars(apiToken, destinationConfig.repositoryId, throttle);
    const scopedEnvVars = filterByScope(envVars, destinationConfig);

    for (const envVar of scopedEnvVars) {
      if (!(envVar.name in secretMap)) continue;

      try {
        await makeRequestWithRetry(throttle, () =>
          request.delete(
            `${IntegrationUrls.TRAVISCI_API_URL}/repo/${encodeURIComponent(
              destinationConfig.repositoryId
            )}/env_var/${encodeURIComponent(envVar.id)}`,
            { headers: travisCIApiHeaders(apiToken) }
          )
        );
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) continue;
        throw new SecretSyncError({ error, secretKey: envVar.name });
      }
    }
  }
};
