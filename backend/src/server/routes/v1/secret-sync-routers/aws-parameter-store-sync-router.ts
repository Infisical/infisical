import {
  AwsParameterStoreSyncSchema,
  CreateAwsParameterStoreSyncSchema,
  UpdateAwsParameterStoreSyncSchema
} from "@app/services/secret-sync/aws-parameter-store";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAwsParameterStoreSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AWSParameterStore,
    server,
    responseSchema: AwsParameterStoreSyncSchema,
    createSchema: CreateAwsParameterStoreSyncSchema,
    updateSchema: UpdateAwsParameterStoreSyncSchema
  });
