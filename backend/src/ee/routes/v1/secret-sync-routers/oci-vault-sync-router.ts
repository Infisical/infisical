import {
  CreateOCIVaultSyncSchema,
  OCIVaultSyncSchema,
  UpdateOCIVaultSyncSchema
} from "@app/ee/services/secret-sync/oci-vault";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "../../../../server/routes/v1/secret-sync-routers/secret-sync-endpoints";

export const registerOCIVaultSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.OCIVault,
    server,
    responseSchema: OCIVaultSyncSchema,
    createSchema: CreateOCIVaultSyncSchema,
    updateSchema: UpdateOCIVaultSyncSchema
  });
