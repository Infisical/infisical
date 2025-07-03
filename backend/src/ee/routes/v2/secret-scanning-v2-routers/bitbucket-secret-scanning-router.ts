import { registerSecretScanningEndpoints } from "@app/ee/routes/v2/secret-scanning-v2-routers/secret-scanning-v2-endpoints";
import {
  BitBucketDataSourceSchema,
  CreateBitBucketDataSourceSchema,
  UpdateBitBucketDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/bitbucket";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export const registerBitBucketSecretScanningRouter = async (server: FastifyZodProvider) =>
  registerSecretScanningEndpoints({
    type: SecretScanningDataSource.BitBucket,
    server,
    responseSchema: BitBucketDataSourceSchema,
    createSchema: CreateBitBucketDataSourceSchema,
    updateSchema: UpdateBitBucketDataSourceSchema
  });
