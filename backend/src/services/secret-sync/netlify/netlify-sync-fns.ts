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

    const baseParams = {
      account_id: config.accountId,
      site_id: config.siteId
    }

    const params = {
      ...baseParams,
      context_name: config.context,
    };

    const variables = await NetlifyPublicAPI.getVariables(secretSync.connection, baseParams);
    const existingInNetlify = Object.fromEntries(variables.map((variable) => [variable.key, variable]));

    const variablesToCreate = Object.keys(secretMap).filter((key) => !existingInNetlify[key]);
    const variablesToUpdate = Object.keys(secretMap).filter((key) => existingInNetlify[key]);
    const variablesToDelete = disableSecretDeletion
      ? []
      : // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        Object.keys(existingInNetlify).filter(
          (key) =>
            !secretMap[key] &&
            matchesSchema(key, environment?.slug || "", keySchema) &&
            existingInNetlify[key].values.some((v) => v.context === config.context)
        );

    for await (const key of variablesToCreate) {
      try {
        await NetlifyPublicAPI.createVariable(secretSync.connection, params, {
          key,
          is_secret: false,
          values: [{ context: config.context, value: secretMap[key].value }]
        });
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    for await (const key of variablesToUpdate) {
      try {
        const existingVar = existingInNetlify[key];

        if (existingVar.is_secret) {
          await NetlifyPublicAPI.deleteVariable(secretSync.connection, params, { key });
          await NetlifyPublicAPI.createVariable(secretSync.connection, params, {
            key,
            is_secret: false,
            // We don't merge existing values from other contexts here because secrets are returned with 
            // masked values. So it would be replaced as *******
            values: [
              { context: config.context, value: secretMap[key].value }
            ]
          });
        } else {
          const mergedValues = [
            ...existingVar.values.filter((v) => v.context !== config.context),
            { context: config.context, value: secretMap[key].value }
          ];
          await NetlifyPublicAPI.updateVariable(secretSync.connection, params, {
            key,
            is_secret: false,
            values: mergedValues
          });
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    for await (const key of variablesToDelete) {
      try {
        const variable = existingInNetlify[key];
        const remainingValues = variable.values.filter((v) => v.context !== config.context);

        if (remainingValues.length > 0) {
          await NetlifyPublicAPI.updateVariable(secretSync.connection, params, {
            key,
            values: remainingValues
          });
        } else {
          await NetlifyPublicAPI.deleteVariable(secretSync.connection, params, { key });
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }
  },

  async removeSecrets(secretSync: TNetlifySyncWithCredentials, secretMap: TSecretMap) {
    const config = secretSync.destinationConfig;

    const baseParams = {
      account_id: config.accountId,
      site_id: config.siteId
    };

    const params = {
      ...baseParams,
      context_name: config.context
    };

    const variables = await NetlifyPublicAPI.getVariables(secretSync.connection, baseParams);

    const existingSecrets = Object.fromEntries(variables.map((variable) => [variable.key, variable]));

    for await (const secret of Object.keys(existingSecrets)) {
      try {
        if (secret in secretMap) {
          const variable = existingSecrets[secret];
          const remainingValues = variable.values.filter((v) => v.context !== config.context);

          if (remainingValues.length > 0) {
            await NetlifyPublicAPI.updateVariable(secretSync.connection, params, {
              key: secret,
              values: remainingValues
            });
          } else {
            await NetlifyPublicAPI.deleteVariable(secretSync.connection, params, { key: secret });
          }
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
