/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { TChecklyVariable } from "@app/services/app-connection/checkly";
import { ChecklyPublicAPI } from "@app/services/app-connection/checkly/checkly-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import { TChecklySyncWithCredentials } from "./checkly-sync-types";

export const ChecklySyncFns = {
  async getSecrets(secretSync: TChecklySyncWithCredentials): Promise<TSecretMap> {
    try {
      let page = 1;
      let hasNextPage = true;

      const variables: Array<TChecklyVariable> = [];

      // Fetch all variables in a paginated manner
      while (hasNextPage) {
        // eslint-disable-next-line no-await-in-loop
        const res = await ChecklyPublicAPI.getVariables(secretSync.connection, 50, page);

        if ((res && Array.isArray(res) && res.length === 0) || !res) {
          hasNextPage = false;
          break;
        }

        variables.push(...res);
        page += 1;
      }

      const entries = {} as TSecretMap;

      for (const v of variables) {
        // If variable is a secret it's value will be null
        // and we should not include it in the sync
        if (v.secret === true) continue;

        entries[v.key] = {
          value: v.value
        };
      }

      return entries;
    } catch (error) {
      throw new SecretSyncError({
        error,
        message: "Failed to import secrets from Checkly"
      });
    }
  },

  async syncSecrets(secretSync: TChecklySyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const railwaySecrets = await this.getSecrets(secretSync);

    for await (const key of Object.keys(secretMap)) {
      try {
        const existing = railwaySecrets[key];

        if (existing === undefined || existing.value !== secretMap[key].value) {
          // await ChecklyPublicAPI.upsertVariable(secretSync.connection, {
          //   input: {
          //     projectId: config.projectId,
          //     environmentId: config.environmentId,
          //     serviceId: config.serviceId || undefined,
          //     name: key,
          //     value: secretMap[key].value ?? ""
          //   }
          // });
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
          // await ChecklyPublicAPI.deleteVariable(secretSync.connection, {
          //   input: {
          //     projectId: config.projectId,
          //     environmentId: config.environmentId,
          //     serviceId: config.serviceId || undefined,
          //     name: key
          //   }
          // });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }
  },

  async removeSecrets(secretSync: TChecklySyncWithCredentials, secretMap: TSecretMap) {
    const existing = await this.getSecrets(secretSync);
    const config = secretSync.destinationConfig;

    for await (const secret of Object.keys(existing)) {
      try {
        if (secret in secretMap) {
          // await ChecklyPublicAPI.deleteVariable(secretSync.connection, {
          //   input: {
          //     projectId: config.projectId,
          //     environmentId: config.environmentId,
          //     serviceId: config.serviceId || undefined,
          //     name: secret
          //   }
          // });
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
