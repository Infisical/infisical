import {
  AwsSecretsManagerSyncSchema,
  CreateAwsSecretsManagerSyncSchema,
  UpdateAwsSecretsManagerSyncSchema
} from "@app/services/secret-sync/aws-secrets-manager";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAwsSecretsManagerSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AWSSecretsManager,
    server,
    responseSchema: AwsSecretsManagerSyncSchema,
    createSchema: CreateAwsSecretsManagerSyncSchema,
    updateSchema: UpdateAwsSecretsManagerSyncSchema
  });
