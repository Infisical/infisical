import { registerSecretScanningEndpoints } from "@app/ee/routes/v2/secret-scanning-v2-routers/secret-scanning-v2-endpoints";
import {
  BitbucketDataSourceSchema,
  CreateBitbucketDataSourceSchema,
  UpdateBitbucketDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/bitbucket";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export const registerBitbucketSecretScanningRouter = async (server: FastifyZodProvider) =>
  registerSecretScanningEndpoints({
    type: SecretScanningDataSource.Bitbucket,
    server,
    responseSchema: BitbucketDataSourceSchema,
    createSchema: CreateBitbucketDataSourceSchema,
    updateSchema: UpdateBitbucketDataSourceSchema
  });
