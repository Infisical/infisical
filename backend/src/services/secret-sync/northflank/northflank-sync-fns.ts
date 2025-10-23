import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TNorthflankSyncWithCredentials } from "./northflank-sync-types";

const NORTHFLANK_API_URL = "https://api.northflank.com";

const buildNorthflankAPIErrorMessage = (error: unknown): string => {
  let errorMessage = "Northflank API returned an error.";

  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as AxiosError;

    if (axiosError.response?.data) {
      // This is the shape of the error response from the Northflank API
      const responseData = axiosError.response.data as {
        error?: { message?: string; details?: Record<string, string[]> };
        message?: string;
      };
      const errorParts = [];

      if (responseData.error?.message) {
        errorParts.push(responseData.error.message);
      } else if (responseData.message) {
        errorParts.push(responseData.message);
      }

      if (responseData.error?.details) {
        const { details } = responseData.error;

        // Flatten the details object into a string
        Object.entries(details).forEach(([field, fieldErrors]) => {
          if (Array.isArray(fieldErrors)) {
            fieldErrors.forEach((fieldError) => errorParts.push(`${field}: ${fieldError}`));
          } else {
            errorParts.push(`${field}: ${String(fieldErrors)}`);
          }
        });
      }

      errorMessage += ` ${errorParts.join(". ")}`;
    }
  }

  return errorMessage;
};

const getNorthflankSecrets = async (secretSync: TNorthflankSyncWithCredentials): Promise<Record<string, string>> => {
  const {
    destinationConfig: { projectId, secretGroupId },
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  try {
    const {
      data: {
        data: {
          secrets: { variables }
        }
      }
    } = await request.get<{
      data: {
        secrets: {
          variables: Record<string, string>;
        };
      };
    }>(`${NORTHFLANK_API_URL}/v1/projects/${projectId}/secrets/${secretGroupId}/details`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });

    return variables;
  } catch (error: unknown) {
    throw new Error(`Failed to fetch Northflank secrets. ${buildNorthflankAPIErrorMessage(error)}`);
  }
};

const updateNorthflankSecrets = async (
  secretSync: TNorthflankSyncWithCredentials,
  variables: Record<string, string>
): Promise<void> => {
  const {
    destinationConfig: { projectId, secretGroupId },
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  try {
    await request.patch(
      `${NORTHFLANK_API_URL}/v1/projects/${projectId}/secrets/${secretGroupId}`,
      {
        secrets: {
          variables
        }
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        }
      }
    );
  } catch (error: unknown) {
    throw new Error(`Failed to update Northflank secrets. ${buildNorthflankAPIErrorMessage(error)}`);
  }
};

export const NorthflankSyncFns = {
  syncSecrets: async (secretSync: TNorthflankSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const northflankSecrets = await getNorthflankSecrets(secretSync);

    const updatedVariables: Record<string, string> = {};

    for (const [key, value] of Object.entries(northflankSecrets)) {
      const shouldKeep =
        !secretMap[key] && // this prevents duplicates from infisical secrets, because we add all of them to the updateVariables in the next loop
        (secretSync.syncOptions.disableSecretDeletion ||
          !matchesSchema(key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema));

      if (shouldKeep) {
        updatedVariables[key] = value;
      }
    }

    for (const [key, { value }] of Object.entries(secretMap)) {
      updatedVariables[key] = value;
    }

    await updateNorthflankSecrets(secretSync, updatedVariables);
  },

  getSecrets: async (secretSync: TNorthflankSyncWithCredentials): Promise<TSecretMap> => {
    const northflankSecrets = await getNorthflankSecrets(secretSync);
    return Object.fromEntries(Object.entries(northflankSecrets).map(([key, value]) => [key, { value }]));
  },

  removeSecrets: async (secretSync: TNorthflankSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const northflankSecrets = await getNorthflankSecrets(secretSync);

    const updatedVariables: Record<string, string> = {};

    for (const [key, value] of Object.entries(northflankSecrets)) {
      if (!(key in secretMap)) {
        updatedVariables[key] = value;
      }
    }

    await updateNorthflankSecrets(secretSync, updatedVariables);
  }
};
