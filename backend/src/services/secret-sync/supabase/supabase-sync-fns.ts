/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TSupabaseSecret } from "@app/services/app-connection/supabase";
import { SupabasePublicAPI } from "@app/services/app-connection/supabase/supabase-connection-public-client";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSyncSecretsResult } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { TSupabaseSyncWithCredentials } from "./supabase-sync-types";

// Supabase reserves this prefix for the secrets it manages itself (SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_PUBLISHABLE_KEYS
// and more over time). It refuses to create or delete them, and injects them into Edge Functions.
const SUPABASE_RESERVED_PREFIX = "SUPABASE_";

const isSupabaseReservedSecret = (key: string) => key.startsWith(SUPABASE_RESERVED_PREFIX);

// The message is saved to the sync's lastSyncMessage column, which holds 1024 characters.
const MAX_SKIPPED_NAMES_LENGTH = 800;

const buildSkippedSecretsMessage = (skippedKeys: string[]) => {
  const names = skippedKeys.join(", ");
  const listedNames =
    names.length > MAX_SKIPPED_NAMES_LENGTH ? `${names.slice(0, MAX_SKIPPED_NAMES_LENGTH - 3)}...` : names;

  return `Skipped ${skippedKeys.length} ${skippedKeys.length === 1 ? "secret" : "secrets"} with the reserved ${SUPABASE_RESERVED_PREFIX} prefix, which Supabase manages itself: ${listedNames}`;
};

export const SupabaseSyncFns = {
  async getSecrets(secretSync: TSupabaseSyncWithCredentials) {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(
    secretSync: TSupabaseSyncWithCredentials,
    payload: TSecretSyncPayload
  ): Promise<TSyncSecretsResult | undefined> {
    const secretMap = payload.flatten();
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const config = secretSync.destinationConfig;

    const variables = await SupabasePublicAPI.getVariables(secretSync.connection, config.projectId);

    const supabaseSecrets = new Map(variables!.map((variable) => [variable.name, variable]));

    const toCreate: TSupabaseSecret[] = [];
    const skippedKeys: string[] = [];

    for (const key of Object.keys(secretMap)) {
      if (isSupabaseReservedSecret(key)) {
        skippedKeys.push(key);
        continue;
      }

      const variable: TSupabaseSecret = { name: key, value: secretMap[key].value ?? "" };
      toCreate.push(variable);
    }

    if (skippedKeys.length) {
      logger.warn(
        `SecretSync Supabase skipped secrets with the reserved ${SUPABASE_RESERVED_PREFIX} prefix [syncId=${secretSync.id}] [projectId=${config.projectId}] [keys=${skippedKeys.join(",")}]`
      );
    }

    for await (const batch of chunkArray(toCreate, 100)) {
      try {
        await SupabasePublicAPI.createVariables(secretSync.connection, config.projectId, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0].name // Use the first key in the batch for error reporting
        });
      }
    }

    const result = skippedKeys.length ? { message: buildSkippedSecretsMessage(skippedKeys) } : undefined;

    if (disableSecretDeletion) return result;

    const toDelete: string[] = [];

    for (const key of supabaseSecrets.keys()) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", keySchema) || isSupabaseReservedSecret(key)) continue;

      if (!secretMap[key]) {
        toDelete.push(key);
      }
    }

    for await (const batch of chunkArray(toDelete, 100)) {
      try {
        await SupabasePublicAPI.deleteVariables(secretSync.connection, config.projectId, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0] // Use the first key in the batch for error reporting
        });
      }
    }

    return result;
  },

  async removeSecrets(secretSync: TSupabaseSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const config = secretSync.destinationConfig;

    const variables = await SupabasePublicAPI.getVariables(secretSync.connection, config.projectId);

    const supabaseSecrets = new Map(variables!.map((variable) => [variable.name, variable]));

    const toDelete: string[] = [];

    for (const key of supabaseSecrets.keys()) {
      if (isSupabaseReservedSecret(key) || !(key in secretMap)) continue;

      toDelete.push(key);
    }

    for await (const batch of chunkArray(toDelete, 100)) {
      try {
        await SupabasePublicAPI.deleteVariables(secretSync.connection, config.projectId, ...batch);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: batch[0] // Use the first key in the batch for error reporting
        });
      }
    }
  }
};
