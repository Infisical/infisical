import {
  CreateNetlifySyncSchema,
  NetlifySyncSchema,
  UpdateNetlifySyncSchema
} from "@app/services/secret-sync/netlify/netlify-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerNetlifySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Netlify,
    server,
    responseSchema: NetlifySyncSchema,
    createSchema: CreateNetlifySyncSchema,
    updateSchema: UpdateNetlifySyncSchema
  });
