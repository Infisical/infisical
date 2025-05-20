import {
  CreateOCIVaultSyncSchema,
  OCIVaultSyncSchema,
  UpdateOCIVaultSyncSchema
} from "@app/services/secret-sync/oci-vault";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerOCIVaultSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.OCIVault,
    server,
    responseSchema: OCIVaultSyncSchema,
    createSchema: CreateOCIVaultSyncSchema,
    updateSchema: UpdateOCIVaultSyncSchema
  });
