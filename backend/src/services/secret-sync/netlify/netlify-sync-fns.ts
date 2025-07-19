/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { NetlifyPublicAPI } from "@app/services/app-connection/netlify/netlify-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import type { TNetlifySyncWithCredentials } from "./netlify-sync-types";

export const NetlifySyncFns = {
  async getSecrets(secretSync: TNetlifySyncWithCredentials) {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TNetlifySyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const config = secretSync.destinationConfig;

    const params = {
      account_id: config.accountId,
      context_name: config.context ?? "all", // Only used in the case of getVariables
      site_id: config.siteId
    };

    const variables = await NetlifyPublicAPI.getVariables(secretSync.connection, params);

    const existing = Object.fromEntries(variables!.map((variable) => [variable.key, variable]));

    for await (const key of Object.keys(secretMap)) {
      try {
        const entry = secretMap[key];

        await NetlifyPublicAPI.upsertVariable(secretSync.connection, params, {
          key,
          values: [
            {
              value: entry.value,
              context: config.context ?? "all"
            }
          ]
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (disableSecretDeletion) return;

    for await (const key of Object.keys(existing)) {
      try {
        // eslint-disable-next-line no-continue
        if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

        if (!secretMap[key]) {
          await NetlifyPublicAPI.deleteVariable(secretSync.connection, params, {
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
  },

  async removeSecrets(secretSync: TNetlifySyncWithCredentials, secretMap: TSecretMap) {
    const config = secretSync.destinationConfig;

    const params = {
      account_id: config.accountId,
      context_name: config.context,
      site_id: config.siteId
    };

    const variables = await NetlifyPublicAPI.getVariables(secretSync.connection, params);

    const existingSecrets = Object.fromEntries(variables!.map((variable) => [variable.key, variable]));

    for await (const secret of Object.keys(existingSecrets)) {
      try {
        if (secret in secretMap) {
          await NetlifyPublicAPI.deleteVariable(secretSync.connection, params, {
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
};
