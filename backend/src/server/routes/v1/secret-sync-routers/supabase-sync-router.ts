import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateSupabaseSyncSchema,
  SupabaseSyncSchema,
  UpdateSupabaseSyncSchema
} from "@app/services/secret-sync/supabase";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerSupabaseSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Supabase,
    server,
    responseSchema: SupabaseSyncSchema,
    createSchema: CreateSupabaseSyncSchema,
    updateSchema: UpdateSupabaseSyncSchema
  });
