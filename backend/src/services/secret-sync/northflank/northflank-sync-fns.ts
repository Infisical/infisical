import { request } from "@app/lib/config/request";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { TNorthflankSyncWithCredentials } from "./northflank-sync-types";

const NORTHFLANK_API_URL = "https://api.northflank.com";

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
    throw new SecretSyncError({
      error,
      message: "Failed to fetch Northflank secrets"
    });
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
    throw new SecretSyncError({
      error,
      message: "Failed to update Northflank secrets"
    });
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
