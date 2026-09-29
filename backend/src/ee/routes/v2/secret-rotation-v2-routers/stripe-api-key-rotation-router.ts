import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  CreateStripeApiKeyRotationSchema,
  StripeApiKeyRotationGeneratedCredentialsSchema,
  StripeApiKeyRotationSchema,
  UpdateStripeApiKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/stripe-api-key";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerStripeApiKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.StripeApiKey,
    server,
    responseSchema: StripeApiKeyRotationSchema,
    createSchema: CreateStripeApiKeyRotationSchema,
    updateSchema: UpdateStripeApiKeyRotationSchema,
    generatedCredentialsSchema: StripeApiKeyRotationGeneratedCredentialsSchema
  });
