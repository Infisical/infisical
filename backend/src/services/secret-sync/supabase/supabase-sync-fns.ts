/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { chunkArray } from "@app/lib/fn";
import { TSupabaseSecret } from "@app/services/app-connection/supabase";
import { SupabasePublicAPI } from "@app/services/app-connection/supabase/supabase-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretMap } from "../secret-sync-types";
import { TSupabaseSyncWithCredentials } from "./supabase-sync-types";

export const SupabaseSyncFns = {
  async getSecrets(secretSync: TSupabaseSyncWithCredentials) {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TSupabaseSyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const config = secretSync.destinationConfig;

    const variables = await SupabasePublicAPI.getVariables(secretSync.connection, config.projectRef);

    const supabaseSecrets = new Map(variables!.map((variable) => [variable.name, variable]));

    const toCreate: TSupabaseSecret[] = [];

    for (const key of Object.keys(secretMap)) {
      const existing = supabaseSecrets.get(key);

      if (existing) {
        toCreate.push(existing);
      }
    }

    for await (const batch of chunkArray(toCreate, 100)) {
      try {
        await SupabasePublicAPI.updateVariables(secretSync.connection, config.projectRef, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0].name // Use the first key in the batch for error reporting
        });
      }
    }

    if (disableSecretDeletion) return;

    const toDelete: string[] = [];

    for (const key of Object.keys(supabaseSecrets)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

      if (!secretMap[key]) {
        toDelete.push(key);
      }
    }

    for await (const batch of chunkArray(toDelete, 100)) {
      try {
        await SupabasePublicAPI.deleteVariables(secretSync.connection, config.projectRef, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0] // Use the first key in the batch for error reporting
        });
      }
    }
  },

  async removeSecrets(secretSync: TSupabaseSyncWithCredentials, secretMap: TSecretMap) {
    const config = secretSync.destinationConfig;

    const variables = await SupabasePublicAPI.getVariables(secretSync.connection, config.projectRef);

    const supabaseSecrets = new Map(variables!.map((variable) => [variable.name, variable]));

    const toDelete: string[] = [];

    for (const key of Object.keys(supabaseSecrets)) {
      if (key in secretMap) {
        toDelete.push(key);
      }
    }

    for await (const batch of chunkArray(toDelete, 100)) {
      try {
        await SupabasePublicAPI.deleteVariables(secretSync.connection, config.projectRef, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0] // Use the first key in the batch for error reporting
        });
      }
    }
  }
};
