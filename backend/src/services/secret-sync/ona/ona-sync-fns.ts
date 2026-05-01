import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { ONA_PAGE_SIZE } from "./ona-sync-enums";
import { TOnaListSecretsResponse, TOnaSecret, TOnaSyncWithCredentials } from "./ona-sync-types";

const ONA_LIST_SECRETS_PATH = "/gitpod.v1.SecretService/ListSecrets";
const ONA_CREATE_SECRET_PATH = "/gitpod.v1.SecretService/CreateSecret";
const ONA_UPDATE_SECRET_VALUE_PATH = "/gitpod.v1.SecretService/UpdateSecretValue";
const ONA_DELETE_SECRET_PATH = "/gitpod.v1.SecretService/DeleteSecret";

const ONA_MAX_RETRIES = 3;
const ONA_BASE_RETRY_DELAY_MS = 500;

const ONA_API_URL = "https://app.gitpod.io/api";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryableOnaError = (error: unknown): boolean => {
  if (!(error instanceof AxiosError)) return false;
  if (!error.response) return true;
  const { status } = error.response;
  return status === 429;
};

const withOnaRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (error) {
      if (attempt >= ONA_MAX_RETRIES || !isRetryableOnaError(error)) throw error;
      // eslint-disable-next-line no-await-in-loop
      await sleep(ONA_BASE_RETRY_DELAY_MS * 2 ** attempt);
    }
  }
};

const getAuthHeaders = (secretSync: TOnaSyncWithCredentials) => ({
  Authorization: `Bearer ${secretSync.connection.credentials.personalAccessToken}`,
  "Content-Type": "application/json"
});

const listEnvVarSecrets = async (secretSync: TOnaSyncWithCredentials): Promise<TOnaSecret[]> => {
  const all: TOnaSecret[] = [];
  let token: string | undefined;
  let hasMore = true;

  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-loop-func
    const { data } = await withOnaRetry(async () => {
      return request.post<TOnaListSecretsResponse>(
        `${ONA_API_URL}${ONA_LIST_SECRETS_PATH}`,
        {
          filter: { scope: { projectId: secretSync.destinationConfig.projectId } },
          pagination: { pageSize: ONA_PAGE_SIZE, ...(token ? { token } : {}) }
        },
        { headers: getAuthHeaders(secretSync) }
      );
    });

    if (data?.secrets?.length) all.push(...data.secrets);

    token = data?.pagination?.nextToken || undefined;
    hasMore = Boolean(token);
  }

  return all.filter((secret) => secret.environmentVariable === true);
};

const createEnvVarSecret = async (secretSync: TOnaSyncWithCredentials, name: string, value: string): Promise<void> => {
  await withOnaRetry(async () => {
    return request.post(
      `${ONA_API_URL}${ONA_CREATE_SECRET_PATH}`,
      {
        name,
        value,
        scope: { projectId: secretSync.destinationConfig.projectId },
        environmentVariable: true
      },
      { headers: getAuthHeaders(secretSync) }
    );
  });
};

const updateSecretValue = async (
  secretSync: TOnaSyncWithCredentials,
  secretId: string,
  value: string
): Promise<void> => {
  await withOnaRetry(async () => {
    return request.post(
      `${ONA_API_URL}${ONA_UPDATE_SECRET_VALUE_PATH}`,
      { secretId, value },
      { headers: getAuthHeaders(secretSync) }
    );
  });
};

const deleteSecret = async (secretSync: TOnaSyncWithCredentials, secretId: string): Promise<void> => {
  await withOnaRetry(async () => {
    return request.post(
      `${ONA_API_URL}${ONA_DELETE_SECRET_PATH}`,
      { secretId },
      { headers: getAuthHeaders(secretSync) }
    );
  });
};

export const OnaSyncFns = {
  syncSecrets: async (secretSync: TOnaSyncWithCredentials, secretMap: TSecretMap) => {
    const existingSecrets = await listEnvVarSecrets(secretSync);
    const existingByName = new Map(existingSecrets.map((s) => [s.name, s]));

    for (const key of Object.keys(secretMap)) {
      const prior = existingByName.get(key);
      try {
        if (!prior) {
          // eslint-disable-next-line no-await-in-loop
          await createEnvVarSecret(secretSync, key, secretMap[key].value);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await updateSecretValue(secretSync, prior.id, secretMap[key].value);
        }
      } catch (error) {
        if (error instanceof SecretSyncError) throw error;
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for (const existing of existingSecrets) {
      if (!matchesSchema(existing.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (secretMap[existing.name]) {
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await deleteSecret(secretSync, existing.id);
      } catch (error) {
        if (error instanceof SecretSyncError) throw error;
        throw new SecretSyncError({ error, secretKey: existing.name });
      }
    }
  },

  getSecrets: async (): Promise<TSecretMap> => {
    // Ona's GetSecretValue endpoint only returns values from within an active workspace/environment,
    // so importing secret values from outside a workspace is not possible with a PAT. Import is
    // intentionally disabled (canImportSecrets: false on the schema/list-item).
    throw new Error("Ona does not support importing secrets.");
  },

  removeSecrets: async (secretSync: TOnaSyncWithCredentials, secretMap: TSecretMap) => {
    const existingSecrets = await listEnvVarSecrets(secretSync);

    for (const existing of existingSecrets) {
      if (!(existing.name in secretMap)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await deleteSecret(secretSync, existing.id);
      } catch (error) {
        if (error instanceof SecretSyncError) throw error;
        throw new SecretSyncError({ error, secretKey: existing.name });
      }
    }
  }
};
