import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSpaceliftSyncWithCredentials } from "./spacelift-sync-types";

export const SpaceliftSyncFns = {
  syncSecrets: async (_secretSync: TSpaceliftSyncWithCredentials, _secretMap: TSecretMap): Promise<void> => {
    // TODO: Implement syncing secrets to Spacelift context
  },

  getSecrets: async (secretSync: TSpaceliftSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (_secretSync: TSpaceliftSyncWithCredentials, _secretMap: TSecretMap): Promise<void> => {
    // TODO: Implement removing secrets from Spacelift context
  }
};
