/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { TDigitalOceanVariable } from "@app/services/app-connection/digital-ocean";
import { DigitalOceanAppPlatformPublicAPI } from "@app/services/app-connection/digital-ocean/digital-ocean-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretMap } from "../secret-sync-types";
import { TDigitalOceanAppPlatformSyncWithCredentials } from "./digital-ocean-app-platform-sync-types";

export const DigitalOceanAppPlatformSyncFns = {
  async getSecrets(secretSync: TDigitalOceanAppPlatformSyncWithCredentials) {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TDigitalOceanAppPlatformSyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const config = secretSync.destinationConfig;

    const variables = await DigitalOceanAppPlatformPublicAPI.getVariables(secretSync.connection, config.appId);

    const existingSecrets = Object.fromEntries(variables.map((variable) => [variable.key, variable]));

    try {
      const vars = Object.entries(secretMap).map(
        ([key, v]) =>
          ({
            key,
            value: v.value,
            type: "SECRET"
          }) as TDigitalOceanVariable
      );

      await DigitalOceanAppPlatformPublicAPI.upsertVariables(secretSync.connection, config.appId, ...vars);
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }

    if (disableSecretDeletion) return;

    try {
      const vars = Object.entries(existingSecrets)
        .map(([key, v]) => {
          if (!matchesSchema(key, environment?.slug || "", keySchema)) return;

          if (key in secretMap) return;

          return {
            key,
            value: v.value,
            type: "SECRET"
          } as TDigitalOceanVariable;
        })
        .filter(Boolean) as TDigitalOceanVariable[];

      await DigitalOceanAppPlatformPublicAPI.deleteVariables(secretSync.connection, config.appId, ...vars);
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },

  async removeSecrets(secretSync: TDigitalOceanAppPlatformSyncWithCredentials, secretMap: TSecretMap) {
    const config = secretSync.destinationConfig;

    try {
      const existingSecrets = await DigitalOceanAppPlatformPublicAPI.getVariables(secretSync.connection, config.appId);

      const vars = Object.entries(existingSecrets)
        .map(([key, v]) => {
          if (!(key in secretMap)) return;

          return {
            key,
            value: v.value,
            type: "SECRET"
          } as TDigitalOceanVariable;
        })
        .filter(Boolean) as TDigitalOceanVariable[];

      await DigitalOceanAppPlatformPublicAPI.deleteVariables(secretSync.connection, config.appId, ...vars);
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  }
};
