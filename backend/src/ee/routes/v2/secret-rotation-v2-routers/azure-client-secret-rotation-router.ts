import {
  AzureClientSecretRotationGeneratedCredentialsSchema,
  AzureClientSecretRotationSchema,
  CreateAzureClientSecretRotationSchema,
  UpdateAzureClientSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/azure-client-secret";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerAzureClientSecretRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.AzureClientSecret,
    server,
    responseSchema: AzureClientSecretRotationSchema,
    createSchema: CreateAzureClientSecretRotationSchema,
    updateSchema: UpdateAzureClientSecretRotationSchema,
    generatedCredentialsSchema: AzureClientSecretRotationGeneratedCredentialsSchema
  });
