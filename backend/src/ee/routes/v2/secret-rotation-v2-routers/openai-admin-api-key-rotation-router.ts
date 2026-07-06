import {
  CreateOpenAIAdminApiKeyRotationSchema,
  OpenAIAdminApiKeyRotationGeneratedCredentialsSchema,
  OpenAIAdminApiKeyRotationSchema,
  UpdateOpenAIAdminApiKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/openai-admin-api-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerOpenAIAdminApiKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.OpenAIAdminApiKey,
    server,
    responseSchema: OpenAIAdminApiKeyRotationSchema,
    createSchema: CreateOpenAIAdminApiKeyRotationSchema,
    updateSchema: UpdateOpenAIAdminApiKeyRotationSchema,
    generatedCredentialsSchema: OpenAIAdminApiKeyRotationGeneratedCredentialsSchema
  });
