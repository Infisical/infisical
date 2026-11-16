import { CreateJenkinsSyncSchema, JenkinsSyncSchema, UpdateJenkinsSyncSchema } from "@app/services/secret-sync/jenkins";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerJenkinsSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Jenkins,
    server,
    responseSchema: JenkinsSyncSchema,
    createSchema: CreateJenkinsSyncSchema,
    updateSchema: UpdateJenkinsSyncSchema
  });
