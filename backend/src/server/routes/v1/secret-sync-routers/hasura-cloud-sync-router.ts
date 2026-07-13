import {
  CreateHasuraCloudSyncSchema,
  HasuraCloudSyncSchema,
  UpdateHasuraCloudSyncSchema
} from "@app/services/secret-sync/hasura-cloud/hasura-cloud-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerHasuraCloudSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.HasuraCloud,
    server,
    responseSchema: HasuraCloudSyncSchema,
    createSchema: CreateHasuraCloudSyncSchema,
    updateSchema: UpdateHasuraCloudSyncSchema
  });
