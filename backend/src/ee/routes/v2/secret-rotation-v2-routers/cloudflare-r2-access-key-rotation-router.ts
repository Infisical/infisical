import {
  CloudflareR2AccessKeyRotationGeneratedCredentialsSchema,
  CloudflareR2AccessKeyRotationSchema,
  CreateCloudflareR2AccessKeyRotationSchema,
  UpdateCloudflareR2AccessKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/cloudflare-r2-access-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerCloudflareR2AccessKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.CloudflareR2AccessKey,
    server,
    responseSchema: CloudflareR2AccessKeyRotationSchema,
    createSchema: CreateCloudflareR2AccessKeyRotationSchema,
    updateSchema: UpdateCloudflareR2AccessKeyRotationSchema,
    generatedCredentialsSchema: CloudflareR2AccessKeyRotationGeneratedCredentialsSchema
  });
