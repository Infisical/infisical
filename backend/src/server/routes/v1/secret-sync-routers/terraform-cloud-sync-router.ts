import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateTerraformCloudSyncSchema,
  TerraformCloudSyncSchema,
  UpdateTerraformCloudSyncSchema
} from "@app/services/secret-sync/terraform-cloud";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerTerraformCloudSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.TerraformCloud,
    server,
    responseSchema: TerraformCloudSyncSchema,
    createSchema: CreateTerraformCloudSyncSchema,
    updateSchema: UpdateTerraformCloudSyncSchema
  });
