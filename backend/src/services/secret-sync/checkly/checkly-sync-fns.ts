/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { ChecklyPublicAPI } from "@app/services/app-connection/checkly/checkly-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretMap } from "../secret-sync-types";
import { TChecklySyncWithCredentials } from "./checkly-sync-types";

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

    const connectionWithDestinationAccountId = {
      ...secretSync.connection,
      credentials: {
        ...secretSync.connection.credentials,
        accountId: config.accountId
      }
    };

    const variables = await ChecklyPublicAPI.getVariables(connectionWithDestinationAccountId);

    const checklySecrets = Object.fromEntries(variables!.map((variable) => [variable.key, variable]));

    for await (const key of Object.keys(secretMap)) {
      try {
        const existing = checklySecrets[key];

        if (existing === undefined || existing.value !== secretMap[key].value) {
          await ChecklyPublicAPI.upsertVariable(connectionWithDestinationAccountId, {
            key,
            value: secretMap[key].value ?? "",
            secret: true,
            locked: true
          });
        }
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
          await ChecklyPublicAPI.deleteVariable(connectionWithDestinationAccountId, {
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

  async removeSecrets(secretSync: TChecklySyncWithCredentials, secretMap: TSecretMap) {
    const config = secretSync.destinationConfig;

    const connectionWithDestinationAccountId = {
      ...secretSync.connection,
      credentials: {
        ...secretSync.connection.credentials,
        accountId: config.accountId
      }
    };

    const variables = await ChecklyPublicAPI.getVariables(connectionWithDestinationAccountId);

    const checklySecrets = Object.fromEntries(variables!.map((variable) => [variable.key, variable]));

    for await (const secret of Object.keys(checklySecrets)) {
      try {
        if (secret in secretMap) {
          await ChecklyPublicAPI.deleteVariable(connectionWithDestinationAccountId, {
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
