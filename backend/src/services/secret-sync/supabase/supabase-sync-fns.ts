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

const SUPABASE_INTERNAL_SECRETS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"];

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
    // Supabase treats project branches as separate projects
    const projectId = config?.projectBranchId || config.projectId;

    const variables = await SupabasePublicAPI.getVariables(secretSync.connection, projectId);

    const supabaseSecrets = new Map(variables!.map((variable) => [variable.name, variable]));

    const toCreate: TSupabaseSecret[] = [];

    for (const key of Object.keys(secretMap)) {
      const variable: TSupabaseSecret = { name: key, value: secretMap[key].value ?? "" };
      toCreate.push(variable);
    }

    for await (const batch of chunkArray(toCreate, 100)) {
      try {
        await SupabasePublicAPI.createVariables(secretSync.connection, projectId, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0].name // Use the first key in the batch for error reporting
        });
      }
    }

    if (disableSecretDeletion) return;

    const toDelete: string[] = [];

    for (const key of supabaseSecrets.keys()) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", keySchema) || SUPABASE_INTERNAL_SECRETS.includes(key)) continue;

      if (!secretMap[key]) {
        toDelete.push(key);
      }
    }

    for await (const batch of chunkArray(toDelete, 100)) {
      try {
        await SupabasePublicAPI.deleteVariables(secretSync.connection, projectId, ...batch);
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
    const projectId = config?.projectBranchId || config.projectId;

    const variables = await SupabasePublicAPI.getVariables(secretSync.connection, projectId);

    const supabaseSecrets = new Map(variables!.map((variable) => [variable.name, variable]));

    const toDelete: string[] = [];

    for (const key of supabaseSecrets.keys()) {
      if (SUPABASE_INTERNAL_SECRETS.includes(key) || !(key in secretMap)) continue;

      toDelete.push(key);
    }

    for await (const batch of chunkArray(toDelete, 100)) {
      try {
        await SupabasePublicAPI.deleteVariables(secretSync.connection, projectId, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0] // Use the first key in the batch for error reporting
        });
      }
    }
  }
};
