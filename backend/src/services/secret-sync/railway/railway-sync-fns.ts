/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { logger } from "@app/lib/logger";
import { RAILWAY_NON_REDEPLOYABLE_STATUSES } from "@app/services/app-connection/railway/railway-connection-constants";
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

        // Railway returns null for sealed/unrendered variables (unrendered: true). Skip them so we
        // neither hit Buffer.from(null) during import nor overwrite the sealed value with "" on sync-back.
        // eslint-disable-next-line no-continue
        if (value === null) continue;

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
        first: 10
      });

      const edges = latestDeployment?.deployments.edges ?? [];

      // Only deployments with a build snapshot can be redeployed; deployments in states like
      // BUILDING/FAILED/REMOVED have no snapshot and Railway rejects them with
      // "Cannot redeploy without a snapshot". Pick the most recent redeployable deployment.
      const redeployableDeploymentId = edges.find((edge) => !RAILWAY_NON_REDEPLOYABLE_STATUSES.has(edge.node.status))
        ?.node.id;

      // No redeployable deployment exists yet (e.g. service has never successfully deployed);
      // the variables are already upserted, so skip the redeploy rather than failing the sync.
      if (!redeployableDeploymentId) {
        logger.info({ redeployableDeploymentId }, "Skipping redeploy. No redeployable deployment found.");
        return;
      }

      await RailwayPublicAPI.redeployDeployment(secretSync.connection, {
        input: {
          deploymentId: redeployableDeploymentId
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
