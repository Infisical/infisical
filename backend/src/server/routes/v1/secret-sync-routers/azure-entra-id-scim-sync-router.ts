import {
  AzureEntraIdScimSyncSchema,
  CreateAzureEntraIdScimSyncSchema,
  UpdateAzureEntraIdScimSyncSchema
} from "@app/services/secret-sync/azure-entra-id-scim";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAzureEntraIdScimSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AzureEntraIdScim,
    server,
    responseSchema: AzureEntraIdScimSyncSchema,
    createSchema: CreateAzureEntraIdScimSyncSchema,
    updateSchema: UpdateAzureEntraIdScimSyncSchema
  });
