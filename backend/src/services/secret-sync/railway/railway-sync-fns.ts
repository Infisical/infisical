/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { RailwayGraphQueries } from "@app/services/app-connection/railway";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import { TRailwaySyncWithCredentials, TRailwayVariablesGraphResponse } from "./railway-sync-types";

async function deleteSecret(secretSync: TRailwaySyncWithCredentials, key: string) {
  try {
    const { credentials } = secretSync.connection;

    const config = secretSync.destinationConfig;

    const data = {
      query: RailwayGraphQueries.deleteVariable,
      variables: {
        input: {
          projectId: config.projectId,
          environmentId: config.environmentId,
          serviceId: config.serviceId || undefined,
          name: key
        }
      }
    };

    await request.post(IntegrationUrls.RAILWAY_API_URL, data, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    // Come back to this for handling ratelimits properly
    throw new SecretSyncError({
      error,
      secretKey: key
    });
  }
}

export const RailwaySyncFns = {
  async getSecrets(secretSync: TRailwaySyncWithCredentials): Promise<TSecretMap> {
    const { credentials } = secretSync.connection;

    const config = secretSync.destinationConfig;

    const data = {
      // @sidwebworks
      // Not sure why this is complaining but I guess will come back to this later - maybe Akhil can help
      // For now I have disabled the rule for this file
      query: RailwayGraphQueries.getVariables,
      variables: {
        projectId: config.projectId,
        environmentId: config.environmentId,
        serviceId: config.serviceId || undefined
      }
    };

    const response = await request.post<TRailwayVariablesGraphResponse>(IntegrationUrls.RAILWAY_API_URL, data, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        "Content-Type": "application/json"
      }
    });

    return Object.entries(response.data.data.variables).reduce((acc, [key, value]) => {
      acc[key] = {
        value
      };
      return acc;
    }, {} as TSecretMap);
  },

  async upsertSecret(secretSync: TRailwaySyncWithCredentials, key: string, value: string) {
    try {
      const { credentials } = secretSync.connection;

      const config = secretSync.destinationConfig;

      const data = {
        query: RailwayGraphQueries.upsertVariable,
        variables: {
          input: {
            projectId: config.projectId,
            environmentId: config.environmentId,
            serviceId: config.serviceId || undefined,
            name: key,
            value: value ?? ""
          }
        }
      };

      await request.post(IntegrationUrls.RAILWAY_API_URL, data, {
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      logger.error(error, "Error while upserting secret in Railway");
      // TODO: Handle ratelimits correctly
      throw new SecretSyncError({
        error,
        secretKey: key
      });
    }
  },

  async syncSecrets(secretSync: TRailwaySyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const railwaySecrets = await this.getSecrets(secretSync);

    for await (const key of Object.keys(secretMap)) {
      try {
        const existing = railwaySecrets[key];

        if (existing === undefined || existing.value !== secretMap[key].value) {
          await this.upsertSecret(secretSync, key, secretMap[key].value);
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
          await deleteSecret(secretSync, key);
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

    for await (const secret of Object.keys(existing)) {
      try {
        if (secret in secretMap) {
          // Might not be a good idea if the secret count is too large - I gues chunking would be better
          await deleteSecret(secretSync, secret);
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
