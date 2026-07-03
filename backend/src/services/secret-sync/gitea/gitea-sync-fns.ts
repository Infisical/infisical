import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TGiteaSyncWithCredentials } from "./gitea-sync-types";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

export const GiteaSyncFns = {
  syncSecrets: async (secretSync: TGiteaSyncWithCredentials, secretMap: TSecretMap) => {},

  removeSecrets: async (secretSync: TGiteaSyncWithCredentials, secretMap: TSecretMap) => {},

  getSecrets: async (secretSync: TGiteaSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
