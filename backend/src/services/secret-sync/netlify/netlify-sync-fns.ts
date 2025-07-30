/* eslint-disable no-continue */
import { NetlifyPublicAPI } from "@app/services/app-connection/netlify/netlify-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import type { TNetlifySyncWithCredentials } from "./netlify-sync-types";

export const NetlifySyncFns = {
  async getSecrets(secretSync: TNetlifySyncWithCredentials): Promise<TSecretMap> {
    const config = secretSync.destinationConfig;

    const params = {
      account_id: config.accountId,
      context_name: config.context, // Only used in the case of getVariables
      site_id: config.siteId
    };

    const variables = await NetlifyPublicAPI.getVariables(secretSync.connection, params);

    const map = {} as TSecretMap;

    for (const variable of variables) {
      if (variable.is_secret) continue;

      const latest = variable.values.sort((a, b) => Number(b.created_at) - Number(a.created_at))[0];

      map[variable.key] = {
        value: latest?.value ?? ""
      };
    }

    return map;
  },

  async syncSecrets(secretSync: TNetlifySyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const config = secretSync.destinationConfig;

    const params = {
      account_id: config.accountId,
      context_name: config.context,
      site_id: config.siteId
    };

    const variables = await NetlifyPublicAPI.getVariables(secretSync.connection, params);

    const existing = Object.fromEntries(variables.map((variable) => [variable.key, variable]));

    for await (const key of Object.keys(secretMap)) {
      try {
        const entry = secretMap[key];

        await NetlifyPublicAPI.upsertVariable(secretSync.connection, params, {
          key,
          is_secret: true,
          scopes: ["builds", "functions", "runtime"],
          values: [
            {
              value: entry.value,
              context: config.context
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
        // eslint-disable-next-line no-continue, @typescript-eslint/no-unsafe-argument
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

    const existingSecrets = Object.fromEntries(variables.map((variable) => [variable.key, variable]));

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
