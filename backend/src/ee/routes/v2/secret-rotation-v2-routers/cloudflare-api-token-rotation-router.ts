import {
  CloudflareApiTokenRotationGeneratedCredentialsSchema,
  CloudflareApiTokenRotationSchema,
  CreateCloudflareApiTokenRotationSchema,
  UpdateCloudflareApiTokenRotationSchema
} from "@app/ee/services/secret-rotation-v2/cloudflare-api-token";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerCloudflareApiTokenRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.CloudflareApiToken,
    server,
    responseSchema: CloudflareApiTokenRotationSchema,
    createSchema: CreateCloudflareApiTokenRotationSchema,
    updateSchema: UpdateCloudflareApiTokenRotationSchema,
    generatedCredentialsSchema: CloudflareApiTokenRotationGeneratedCredentialsSchema
  });
