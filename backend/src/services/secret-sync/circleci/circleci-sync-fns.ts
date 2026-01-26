import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { CIRCLECI_API_URL } from "@app/services/app-connection/circleci";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  TCircleCIEnvVarListItem,
  TCircleCIEnvVarListResponse,
  TCircleCISyncWithCredentials
} from "./circleci-sync-types";

const getHeaders = (apiToken: string) => ({
  "Circle-Token": apiToken,
  "Content-Type": "application/json"
});

const getProjectSlug = async (
  projectId: string,
  projectName: string,
  orgName: string,
  apiToken: string
): Promise<string> => {
  const headers = {
    "Circle-Token": apiToken,
    "Accept-Encoding": "application/json"
  };

  // First attempt: Try to get project details using the project ID
  try {
    const { data: projectDetails } = await request.get<{ slug: string }>(
      `${CIRCLECI_API_URL}/v2/project/${projectId}`,
      { headers }
    );
    return projectDetails.slug;
  } catch (err) {
    if (err instanceof AxiosError) {
      if ((err.response?.data as { message?: string })?.message !== "Not Found") {
        throw new Error("Failed to get project slug from CircleCI during first attempt.");
      }
    }
  }

  // Fallback: Construct slug from org + project name
  try {
    const { data: collaborations } = await request.get<{ slug: string; name: string }[]>(
      `${CIRCLECI_API_URL}/v2/me/collaborations`,
      { headers }
    );

    if (orgName) {
      const org = collaborations.find((o) => o.name === orgName);
      if (org) {
        return `${org.slug}/${projectName}`;
      }
    }

    // Last resort: use first organization
    return `${collaborations[0].slug}/${projectName}`;
  } catch (err) {
    throw new Error("Failed to get project slug from CircleCI during second attempt.");
  }
};

const listEnvVars = async (secretSync: TCircleCISyncWithCredentials): Promise<TCircleCIEnvVarListItem[]> => {
  const { connection, destinationConfig } = secretSync;
  const { apiToken } = connection.credentials;
  const { projectId, projectName, orgName } = destinationConfig;

  const projectSlug = await getProjectSlug(projectId, projectName, orgName || "", apiToken);

  logger.info(`CircleCI listEnvVars: projectSlug=${projectSlug}`);

  const envVars: TCircleCIEnvVarListItem[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = `${CIRCLECI_API_URL}/v2/project/${projectSlug}/envvar${
      nextPageToken ? `?page-token=${nextPageToken}` : ""
    }`;

    // eslint-disable-next-line no-await-in-loop
    const response = await request.get<TCircleCIEnvVarListResponse>(url, {
      headers: {
        "Circle-Token": apiToken,
        "Accept-Encoding": "application/json"
      }
    });

    envVars.push(...response.data.items);
    nextPageToken = response.data.next_page_token;
  } while (nextPageToken);

  return envVars;
};

const createOrUpdateEnvVar = async (projectId: string, apiToken: string, name: string, value: string) => {
  const url = `${CIRCLECI_API_URL}/v2/project/${projectId}/envvar`;

  await request.post(
    url,
    { name, value },
    {
      headers: getHeaders(apiToken)
    }
  );
};

const deleteEnvVar = async (projectId: string, apiToken: string, name: string) => {
  const url = `${CIRCLECI_API_URL}/v2/project/${projectId}/envvar/${encodeURIComponent(name)}`;

  await request.delete(url, {
    headers: getHeaders(apiToken)
  });
};

export const CircleCISyncFns = {
  syncSecrets: async (secretSync: TCircleCISyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const { destinationConfig, connection } = secretSync;
    const { projectId, projectName, orgName } = destinationConfig;
    const { apiToken } = connection.credentials;

    const projectSlug = await getProjectSlug(projectId, projectName, orgName || "", apiToken);

    logger.info(`CircleCI syncSecrets: projectSlug=${projectSlug}`);

    // Get existing environment variables
    const existingEnvVars = await listEnvVars(secretSync);

    // Create or update secrets
    for await (const [key, secretData] of Object.entries(secretMap)) {
      try {
        await createOrUpdateEnvVar(projectSlug, apiToken, key, secretData.value);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    // Delete secrets that exist in CircleCI but not in the source (if deletion is not disabled)
    if (!secretSync.syncOptions.disableSecretDeletion) {
      for await (const existingEnvVar of existingEnvVars) {
        if (!matchesSchema(existingEnvVar.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (!(existingEnvVar.name in secretMap)) {
          try {
            await deleteEnvVar(projectSlug, apiToken, existingEnvVar.name);
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
    const { destinationConfig, connection } = secretSync;
    const { projectId, projectName, orgName } = destinationConfig;
    const { apiToken } = connection.credentials;

    // Get the full project slug
    const projectSlug = await getProjectSlug(projectId, projectName, orgName || "", apiToken);

    // Get existing environment variables
    const existingEnvVars = await listEnvVars(secretSync);
    const existingEnvVarNames = new Set(existingEnvVars.map((envVar) => envVar.name));

    // Only remove secrets that exist both in CircleCI and in the provided secret map
    for await (const key of Object.keys(secretMap)) {
      if (existingEnvVarNames.has(key)) {
        try {
          await deleteEnvVar(projectSlug, apiToken, key);
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
