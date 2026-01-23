import { request } from "@app/lib/config/request";
import { CIRCLECI_API_URL } from "@app/services/app-connection/circleci";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TCircleCIEnvVarListItem, TCircleCIEnvVarListResponse, TCircleCISyncWithCredentials } from "./circleci-sync-types";

const getHeaders = (apiToken: string) => ({
  "Circle-Token": apiToken,
  "Content-Type": "application/json"
});

const listEnvVars = async (
  secretSync: TCircleCISyncWithCredentials
): Promise<TCircleCIEnvVarListItem[]> => {
  const { destinationConfig, connection } = secretSync;
  const { projectSlug } = destinationConfig;
  const { apiToken } = connection.credentials;

  const envVars: TCircleCIEnvVarListItem[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = `${CIRCLECI_API_URL}/project/${encodeURIComponent(projectSlug)}/envvar${
      nextPageToken ? `?page-token=${nextPageToken}` : ""
    }`;

    // eslint-disable-next-line no-await-in-loop
    const response = await request.get<TCircleCIEnvVarListResponse>(url, {
      headers: getHeaders(apiToken)
    });

    envVars.push(...response.data.items);
    nextPageToken = response.data.next_page_token;
  } while (nextPageToken);

  return envVars;
};

const createOrUpdateEnvVar = async (
  secretSync: TCircleCISyncWithCredentials,
  name: string,
  value: string
) => {
  const { destinationConfig, connection } = secretSync;
  const { projectSlug } = destinationConfig;
  const { apiToken } = connection.credentials;

  // CircleCI uses POST to create env vars - if the variable already exists, it will be updated
  const url = `${CIRCLECI_API_URL}/project/${encodeURIComponent(projectSlug)}/envvar`;

  await request.post(
    url,
    { name, value },
    {
      headers: getHeaders(apiToken)
    }
  );
};

const deleteEnvVar = async (secretSync: TCircleCISyncWithCredentials, name: string) => {
  const { destinationConfig, connection } = secretSync;
  const { projectSlug } = destinationConfig;
  const { apiToken } = connection.credentials;

  const url = `${CIRCLECI_API_URL}/project/${encodeURIComponent(projectSlug)}/envvar/${encodeURIComponent(name)}`;

  await request.delete(url, {
    headers: getHeaders(apiToken)
  });
};

export const CircleCISyncFns = {
  syncSecrets: async (secretSync: TCircleCISyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    // Get existing environment variables
    const existingEnvVars = await listEnvVars(secretSync);
    const existingEnvVarNames = new Set(existingEnvVars.map((envVar) => envVar.name));

    // Create or update secrets
    for (const [key, secretData] of Object.entries(secretMap)) {
      try {
        await createOrUpdateEnvVar(secretSync, key, secretData.value);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    // Delete secrets that exist in CircleCI but not in the source (if deletion is not disabled)
    if (!secretSync.syncOptions.disableSecretDeletion) {
      for (const existingEnvVar of existingEnvVars) {
        // Skip if the secret doesn't match the schema pattern
        if (!matchesSchema(existingEnvVar.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // Delete if it exists in CircleCI but not in the source secret map
        if (!(existingEnvVar.name in secretMap)) {
          try {
            await deleteEnvVar(secretSync, existingEnvVar.name);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: existingEnvVar.name
            });
          }
        }
      }
    }
  },

  getSecrets: async (secretSync: TCircleCISyncWithCredentials): Promise<TSecretMap> => {
    // CircleCI masks environment variable values (returns "****xxxx")
    // Therefore, importing secrets is not supported
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TCircleCISyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    // Get existing environment variables
    const existingEnvVars = await listEnvVars(secretSync);
    const existingEnvVarNames = new Set(existingEnvVars.map((envVar) => envVar.name));

    // Only remove secrets that exist both in CircleCI and in the provided secret map
    for (const key of Object.keys(secretMap)) {
      if (existingEnvVarNames.has(key)) {
        try {
          await deleteEnvVar(secretSync, key);
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  }
};
