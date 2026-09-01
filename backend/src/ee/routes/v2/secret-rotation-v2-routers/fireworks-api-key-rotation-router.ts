import {
  CreateFireworksApiKeyRotationSchema,
  FireworksApiKeyRotationGeneratedCredentialsSchema,
  FireworksApiKeyRotationSchema,
  UpdateFireworksApiKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/fireworks-api-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerFireworksApiKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.FireworksApiKey,
    server,
    responseSchema: FireworksApiKeyRotationSchema,
    createSchema: CreateFireworksApiKeyRotationSchema,
    updateSchema: UpdateFireworksApiKeyRotationSchema,
    generatedCredentialsSchema: FireworksApiKeyRotationGeneratedCredentialsSchema
  });
