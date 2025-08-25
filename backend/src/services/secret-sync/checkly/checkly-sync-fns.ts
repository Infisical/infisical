/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { ChecklyPublicAPI } from "@app/services/app-connection/checkly/checkly-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretMap } from "../secret-sync-types";
import { ChecklySyncScope, TChecklySyncWithCredentials } from "./checkly-sync-types";

export const ChecklySyncFns = {
  async getSecrets(secretSync: TChecklySyncWithCredentials) {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TChecklySyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const config = secretSync.destinationConfig;

    if (config.scope === ChecklySyncScope.Group) {
      // Handle group environment variables
      const groupVars = await ChecklyPublicAPI.getCheckGroupEnvironmentVariables(
        secretSync.connection,
        config.accountId,
        config.groupId
      );

      const checklyGroupSecrets = Object.fromEntries(groupVars.map((variable) => [variable.key, variable]));

      // Prepare all variables to update at once
      const updatedVariables = { ...checklyGroupSecrets };

      for (const key of Object.keys(secretMap)) {
        const entry = secretMap[key];

        // If value is empty, we skip adding it - checkly does not allow empty values
        if (entry.value.trim() === "") {
          // Delete the secret from the group if it's empty
          if (!disableSecretDeletion) {
            delete updatedVariables[key];
          }
          continue; // Skip empty values
        }

        // Add or update the variable
        updatedVariables[key] = {
          key,
          value: entry.value,
          locked: true
        };
      }

      // Remove secrets that are not in the secretMap if deletion is enabled
      if (!disableSecretDeletion) {
        for (const key of Object.keys(checklyGroupSecrets)) {
          // eslint-disable-next-line no-continue
          if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

          if (!secretMap[key]) {
            delete updatedVariables[key];
          }
        }
      }

      // Update all group environment variables at once
      try {
        await ChecklyPublicAPI.updateCheckGroupEnvironmentVariables(
          secretSync.connection,
          config.accountId,
          config.groupId,
          Object.values(updatedVariables)
        );
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: "group_update"
        });
      }
    } else {
      // Handle global variables (existing logic)
      const variables = await ChecklyPublicAPI.getVariables(secretSync.connection, config.accountId);

      const checklySecrets = Object.fromEntries(variables!.map((variable) => [variable.key, variable]));

      for await (const key of Object.keys(secretMap)) {
        try {
          const entry = secretMap[key];

          // If value is empty, we skip the upsert - checkly does not allow empty values
          if (entry.value.trim() === "") {
            // Delete the secret from Checkly if its empty
            if (!disableSecretDeletion) {
              await ChecklyPublicAPI.deleteVariable(secretSync.connection, config.accountId, {
                key
              });
            }
            continue; // Skip empty values
          }

          await ChecklyPublicAPI.upsertVariable(secretSync.connection, config.accountId, {
            key,
            value: entry.value,
            secret: true,
            locked: true
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }

      if (disableSecretDeletion) return;

      for await (const key of Object.keys(checklySecrets)) {
        try {
          // eslint-disable-next-line no-continue
          if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

          if (!secretMap[key]) {
            await ChecklyPublicAPI.deleteVariable(secretSync.connection, config.accountId, {
              key
            });
          }
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  },

  async removeSecrets(secretSync: TChecklySyncWithCredentials, secretMap: TSecretMap) {
    const config = secretSync.destinationConfig;

    if (config.scope === ChecklySyncScope.Group) {
      // Handle group environment variables
      const groupVars = await ChecklyPublicAPI.getCheckGroupEnvironmentVariables(
        secretSync.connection,
        config.accountId,
        config.groupId
      );

      const checklyGroupSecrets = Object.fromEntries(groupVars.map((variable) => [variable.key, variable]));

      // Filter out the secrets to remove
      const remainingVariables = Object.keys(checklyGroupSecrets)
        .filter(key => !(key in secretMap))
        .map(key => checklyGroupSecrets[key]);

      try {
        await ChecklyPublicAPI.updateCheckGroupEnvironmentVariables(
          secretSync.connection,
          config.accountId,
          config.groupId,
          remainingVariables
        );
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: "group_remove"
        });
      }
    } else {
      // Handle global variables (existing logic)
      const variables = await ChecklyPublicAPI.getVariables(secretSync.connection, config.accountId);

      const checklySecrets = Object.fromEntries(variables!.map((variable) => [variable.key, variable]));

      for await (const secret of Object.keys(checklySecrets)) {
        try {
          if (secret in secretMap) {
            await ChecklyPublicAPI.deleteVariable(secretSync.connection, config.accountId, {
              key: secret
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
  }
};
