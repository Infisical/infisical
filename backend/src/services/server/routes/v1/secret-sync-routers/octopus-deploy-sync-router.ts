import {
  CreateOctopusDeploySyncSchema,
  OctopusDeploySyncSchema,
  UpdateOctopusDeploySyncSchema
} from "@app/services/secret-sync/octopus-deploy";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerOctopusDeploySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.OctopusDeploy,
    server,
    responseSchema: OctopusDeploySyncSchema,
    createSchema: CreateOctopusDeploySyncSchema,
    updateSchema: UpdateOctopusDeploySyncSchema
  });
