import {
  BitbucketSyncSchema,
  CreateBitbucketSyncSchema,
  UpdateBitbucketSyncSchema
} from "@app/services/secret-sync/bitbucket";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerBitbucketSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Bitbucket,
    server,
    responseSchema: BitbucketSyncSchema,
    createSchema: CreateBitbucketSyncSchema,
    updateSchema: UpdateBitbucketSyncSchema
  });
