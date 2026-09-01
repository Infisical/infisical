import {
  CreateOpenAIServiceAccountRotationSchema,
  OpenAIServiceAccountRotationGeneratedCredentialsSchema,
  OpenAIServiceAccountRotationSchema,
  UpdateOpenAIServiceAccountRotationSchema
} from "@app/ee/services/secret-rotation-v2/openai-service-account";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerOpenAIServiceAccountRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.OpenAIServiceAccount,
    server,
    responseSchema: OpenAIServiceAccountRotationSchema,
    createSchema: CreateOpenAIServiceAccountRotationSchema,
    updateSchema: UpdateOpenAIServiceAccountRotationSchema,
    generatedCredentialsSchema: OpenAIServiceAccountRotationGeneratedCredentialsSchema
  });
