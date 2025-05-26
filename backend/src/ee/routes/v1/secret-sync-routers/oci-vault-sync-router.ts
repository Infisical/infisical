import {
  CreateOCIVaultSyncSchema,
  OCIVaultSyncSchema,
  UpdateOCIVaultSyncSchema
} from "@app/ee/services/secret-sync/oci-vault";
import { registerSyncSecretsEndpoints } from "@app/server/routes/v1/secret-sync-routers/secret-sync-endpoints";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

export const registerOCIVaultSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.OCIVault,
    server,
    responseSchema: OCIVaultSyncSchema,
    createSchema: CreateOCIVaultSyncSchema,
    updateSchema: UpdateOCIVaultSyncSchema
  });
