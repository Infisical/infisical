/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { RailwayPublicAPI } from "@app/services/app-connection/railway/railway-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import { TRailwaySyncWithCredentials } from "./railway-sync-types";

export const RailwaySyncFns = {
  async getSecrets(secretSync: TRailwaySyncWithCredentials): Promise<TSecretMap> {
    try {
      const config = secretSync.destinationConfig;

      const variables = await RailwayPublicAPI.getVariables(secretSync.connection, {
        projectId: config.projectId,
        environmentId: config.environmentId,
        serviceId: config.serviceId || undefined
      });

      const entries = {} as TSecretMap;

      for (const [key, value] of Object.entries(variables)) {
        // Skip importing private railway variables
        // eslint-disable-next-line no-continue
        if (key.startsWith("RAILWAY_")) continue;

        entries[key] = {
          value
        };
      }

      return entries;
    } catch (error) {
      throw new SecretSyncError({
        error,
        message: "Failed to import secrets from Railway"
      });
    }
  },

  async syncSecrets(secretSync: TRailwaySyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const railwaySecrets = await this.getSecrets(secretSync);
    const config = secretSync.destinationConfig;

    for await (const key of Object.keys(secretMap)) {
      try {
        const existing = railwaySecrets[key];

        if (existing === undefined || existing.value !== secretMap[key].value) {
          await RailwayPublicAPI.upsertVariable(secretSync.connection, {
            input: {
              projectId: config.projectId,
              environmentId: config.environmentId,
              serviceId: config.serviceId || undefined,
              name: key,
              value: secretMap[key].value ?? ""
            }
          });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (disableSecretDeletion) return;

    for await (const key of Object.keys(railwaySecrets)) {
      try {
        // eslint-disable-next-line no-continue
        if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

        if (!secretMap[key]) {
          await RailwayPublicAPI.deleteVariable(secretSync.connection, {
            input: {
              projectId: config.projectId,
              environmentId: config.environmentId,
              serviceId: config.serviceId || undefined,
              name: key
            }
          });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }
  },

  async removeSecrets(secretSync: TRailwaySyncWithCredentials, secretMap: TSecretMap) {
    const existing = await this.getSecrets(secretSync);
    const config = secretSync.destinationConfig;

    for await (const secret of Object.keys(existing)) {
      try {
        if (secret in secretMap) {
          await RailwayPublicAPI.deleteVariable(secretSync.connection, {
            input: {
              projectId: config.projectId,
              environmentId: config.environmentId,
              serviceId: config.serviceId || undefined,
              name: secret
            }
          });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: secret
        });
      }
    }
  }
};
