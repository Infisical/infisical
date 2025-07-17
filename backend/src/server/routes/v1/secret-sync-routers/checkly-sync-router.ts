import {
  ChecklySyncSchema,
  CreateChecklySyncSchema,
  UpdateChecklySyncSchema
} from "@app/services/secret-sync/checkly/checkly-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerChecklySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Checkly,
    server,
    responseSchema: ChecklySyncSchema,
    createSchema: CreateChecklySyncSchema,
    updateSchema: UpdateChecklySyncSchema
  });
