/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { TDigitalOceanApp, TDigitalOceanVariable } from "@app/services/app-connection/digital-ocean";
import { DigitalOceanAppPlatformPublicAPI } from "@app/services/app-connection/digital-ocean/digital-ocean-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { DIGITAL_OCEAN_ENV_KEY_PATTERN, DIGITAL_OCEAN_ENV_KEY_RULE } from "./digital-ocean-app-platform-sync-schemas";
import { TDigitalOceanAppPlatformSyncWithCredentials } from "./digital-ocean-app-platform-sync-types";

const assertNoDeploymentInProgress = (app: TDigitalOceanApp) => {
  if (app.in_progress_deployment || app.pending_deployment) {
    throw new SecretSyncError({
      message: `A deployment is in progress for DigitalOcean app '${app.spec.name}'. Wait for the deployment to finish, then sync again.`
    });
  }
};

export const DigitalOceanAppPlatformSyncFns = {
  async getSecrets(secretSync: TDigitalOceanAppPlatformSyncWithCredentials) {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TDigitalOceanAppPlatformSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const invalidKeys = Object.keys(secretMap).filter((key) => !DIGITAL_OCEAN_ENV_KEY_PATTERN.test(key));
    if (invalidKeys.length) {
      throw new SecretSyncError({
        secretKey: invalidKeys[0],
        shouldRetry: false,
        message: `${invalidKeys.length} secret ${
          invalidKeys.length === 1 ? "key is" : "keys are"
        } not a valid DigitalOcean environment variable name: ${invalidKeys.join(", ")}. ${DIGITAL_OCEAN_ENV_KEY_RULE}`
      });
    }

    const config = secretSync.destinationConfig;

    const app = await DigitalOceanAppPlatformPublicAPI.getApp(secretSync.connection, config.appId);
    assertNoDeploymentInProgress(app);

    const existing = app.spec.envs ?? [];

    const variables: Record<string, TDigitalOceanVariable> = Object.fromEntries(existing.map((v) => [v.key, v]));

    for (const [key, value] of Object.entries(secretMap)) {
      variables[key] = {
        key,
        value: value.value,
        type: "SECRET"
      } as TDigitalOceanVariable;
    }

    if (!disableSecretDeletion) {
      for (const v of existing) {
        if (!matchesSchema(v.key, environment?.slug || "", keySchema)) continue;
        if (!(v.key in secretMap)) {
          delete variables[v.key];
        }
      }
    }

    try {
      const vars = Object.values(variables);
      await DigitalOceanAppPlatformPublicAPI.putVariables(secretSync.connection, config.appId, ...vars);
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  },

  async removeSecrets(secretSync: TDigitalOceanAppPlatformSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const config = secretSync.destinationConfig;

    try {
      const app = await DigitalOceanAppPlatformPublicAPI.getApp(secretSync.connection, config.appId);
      assertNoDeploymentInProgress(app);

      const vars = (app.spec.envs ?? []).filter((v) => v.key in secretMap);

      await DigitalOceanAppPlatformPublicAPI.deleteVariables(secretSync.connection, config.appId, ...vars);
    } catch (error) {
      if (error instanceof SecretSyncError) throw error;

      throw new SecretSyncError({
        error
      });
    }
  }
};
