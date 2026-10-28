import {
  CreateDenoDeploySyncSchema,
  DenoDeploySyncSchema,
  UpdateDenoDeploySyncSchema
} from "@app/services/secret-sync/deno-deploy";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerDenoDeploySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.DenoDeploy,
    server,
    responseSchema: DenoDeploySyncSchema,
    createSchema: CreateDenoDeploySyncSchema,
    updateSchema: UpdateDenoDeploySyncSchema
  });
