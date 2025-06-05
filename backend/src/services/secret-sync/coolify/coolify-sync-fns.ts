import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";
import { TCoolifySyncWithCredentials } from "./coolify-sync-types";

export const CoolifySyncFns = {
  syncSecrets: async (secretSync: TCoolifySyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { appId }
    } = secretSync;
  }
};
