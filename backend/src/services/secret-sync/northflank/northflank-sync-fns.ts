import { TSecretMap, TSecretSyncWithCredentials } from "@app/services/secret-sync/secret-sync-types";

export const NorthflankSyncFns = {
  syncSecrets: async (secretSync: TSecretSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    // TODO: Will be implemented in the follow up PR
    throw new Error("Northflank secret sync not yet implemented");
  },

  getSecrets: async (secretSync: TSecretSyncWithCredentials): Promise<TSecretMap> => {
    // TODO: Will be implemented in the follow up PR
    throw new Error("Northflank secret retrieval not yet implemented");
  },

  removeSecrets: async (secretSync: TSecretSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    // TODO: Will be implemented in the follow up PR
    throw new Error("Northflank secret removal not yet implemented");
  }
};
