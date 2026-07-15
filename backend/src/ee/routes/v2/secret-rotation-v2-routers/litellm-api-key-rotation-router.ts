import {
  CreateLiteLLMApiKeyRotationSchema,
  LiteLLMApiKeyRotationGeneratedCredentialsSchema,
  LiteLLMApiKeyRotationSchema,
  UpdateLiteLLMApiKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/litellm-api-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerLiteLLMApiKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.LiteLLMApiKey,
    server,
    responseSchema: LiteLLMApiKeyRotationSchema,
    createSchema: CreateLiteLLMApiKeyRotationSchema,
    updateSchema: UpdateLiteLLMApiKeyRotationSchema,
    generatedCredentialsSchema: LiteLLMApiKeyRotationGeneratedCredentialsSchema
  });
