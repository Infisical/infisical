import {
  AzureAppConfigurationSyncSchema,
  CreateAzureAppConfigurationSyncSchema,
  UpdateAzureAppConfigurationSyncSchema
} from "@app/services/secret-sync/azure-app-configuration";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAzureAppConfigurationSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AzureAppConfiguration,
    server,
    responseSchema: AzureAppConfigurationSyncSchema,
    createSchema: CreateAzureAppConfigurationSyncSchema,
    updateSchema: UpdateAzureAppConfigurationSyncSchema
  });
