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
    };

    const params = {
      ...baseParams,
      context_name: config.context
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
        await NetlifyPublicAPI.updateVariableValue(secretSync.connection, params, {
          key,
          context: config.context,
          value: secretMap[key].value
        });
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    for await (const key of variablesToDelete) {
      try {
        const variable = existingInNetlify[key];
        const remainingValues = variable.values.filter((v) => v.context !== config.context);
        const variableToDelete = variable.values.filter((v) => v.context === config.context);

        if (variableToDelete.length > 0 && variableToDelete[0].id) {
          await NetlifyPublicAPI.deleteVariableValue(secretSync.connection, params, {
            key,
            id: variableToDelete[0].id
          });
        }

        // Delete variable if it doesn't have any values left.
        if (remainingValues.length === 0) {
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
          const variableToDelete = variable.values.filter((v) => v.context === config.context);

          if (variableToDelete.length > 0 && variableToDelete[0].id) {
            await NetlifyPublicAPI.deleteVariableValue(secretSync.connection, params, {
              key: secret,
              id: variableToDelete[0].id
            });
          }

          // Delete variable if it doesn't have any values left.
          if (remainingValues.length === 0) {
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
