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
      const { keySchema } = secretSync.syncOptions;
      const { environment } = secretSync;

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

        // Check if key matches the schema
        // eslint-disable-next-line no-continue
        if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

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

  /**
   * Syncs secrets to Railway and redeploys the service if needed.
   *
   * Gets existing Railway vars, merges with new secrets (keeping Railway vars if deletion is disabled),
   * then replaces every variable with the new values, if variable is not in the secretMap, it is deleted.
   * If there's a service, triggers a redeploy to pick up the changes.
   */
  async syncSecrets(secretSync: TRailwaySyncWithCredentials, secretMap: TSecretMap) {
    try {
      const {
        syncOptions: { disableSecretDeletion }
      } = secretSync;
      const railwaySecrets = await this.getSecrets(secretSync);
      const config = secretSync.destinationConfig;

      const railwaySecretsMap = Object.fromEntries(
        Object.entries(railwaySecrets).map(([key, secret]) => [key, secret.value])
      );
      const secretMapMap = Object.fromEntries(Object.entries(secretMap).map(([key, secret]) => [key, secret.value]));

      const toReplace = disableSecretDeletion ? { ...railwaySecretsMap, ...secretMapMap } : secretMapMap;

      const upserted = await RailwayPublicAPI.upsertCollection(secretSync.connection, {
        input: {
          projectId: config.projectId,
          environmentId: config.environmentId,
          serviceId: config.serviceId || undefined,
          skipDeploys: true,
          variables: toReplace,
          replace: true
        }
      });

      if (!upserted)
        throw new SecretSyncError({
          message: "Failed to upsert secrets to Railway"
        });

      if (!config.serviceId) return;

      const latestDeployment = await RailwayPublicAPI.getDeployments(secretSync.connection, {
        input: {
          serviceId: config.serviceId,
          environmentId: config.environmentId
        },
        first: 1
      });

      const latestDeploymentId = latestDeployment?.deployments.edges[0].node.id;

      if (!latestDeploymentId)
        throw new SecretSyncError({
          message: "Failed to get latest deployment from Railway"
        });

      await RailwayPublicAPI.redeployDeployment(secretSync.connection, {
        input: {
          deploymentId: latestDeploymentId
        }
      });
    } catch (error) {
      if (error instanceof SecretSyncError) throw error;

      throw new SecretSyncError({
        error,
        message: "Failed to sync secrets to Railway"
      });
    }
  },

  async removeSecrets(secretSync: TRailwaySyncWithCredentials, secretMap: TSecretMap) {
    const existing = await this.getSecrets(secretSync);
    const config = secretSync.destinationConfig;

    // Create a new variables object excluding secrets that exist in secretMap
    const remainingVariables = Object.fromEntries(
      Object.entries(existing)
        .filter(([key]) => !(key in secretMap))
        .map(([key, secret]) => [key, secret.value])
    );

    try {
      const upserted = await RailwayPublicAPI.upsertCollection(secretSync.connection, {
        input: {
          projectId: config.projectId,
          environmentId: config.environmentId,
          serviceId: config.serviceId || undefined,
          skipDeploys: true,
          variables: remainingVariables,
          replace: true
        }
      });

      if (!upserted) {
        throw new SecretSyncError({
          message: "Failed to remove secrets from Railway"
        });
      }
    } catch (error) {
      if (error instanceof SecretSyncError) throw error;

      throw new SecretSyncError({
        error,
        message: "Failed to remove secrets from Railway"
      });
    }
  }
};
