import {
  AlibabaCloudKMSSyncSchema,
  CreateAlibabaCloudKMSSyncSchema,
  UpdateAlibabaCloudKMSSyncSchema
} from "@app/services/secret-sync/alibaba-cloud-kms";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAlibabaCloudKMSSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AlibabaCloudKMS,
    server,
    responseSchema: AlibabaCloudKMSSyncSchema,
    createSchema: CreateAlibabaCloudKMSSyncSchema,
    updateSchema: UpdateAlibabaCloudKMSSyncSchema
  });
