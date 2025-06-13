import {
  AzureDevOpsSyncSchema,
  CreateAzureDevOpsSyncSchema,
  UpdateAzureDevOpsSyncSchema
} from "@app/services/secret-sync/azure-devops";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAzureDevOpsSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AzureDevOps,
    server,
    responseSchema: AzureDevOpsSyncSchema,
    createSchema: CreateAzureDevOpsSyncSchema,
    updateSchema: UpdateAzureDevOpsSyncSchema
  });
