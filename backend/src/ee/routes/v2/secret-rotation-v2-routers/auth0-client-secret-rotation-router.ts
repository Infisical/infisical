import {
  Auth0ClientSecretRotationGeneratedCredentialsSchema,
  Auth0ClientSecretRotationSchema,
  CreateAuth0ClientSecretRotationSchema,
  UpdateAuth0ClientSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerAuth0ClientSecretRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.Auth0ClientSecret,
    server,
    responseSchema: Auth0ClientSecretRotationSchema,
    createSchema: CreateAuth0ClientSecretRotationSchema,
    updateSchema: UpdateAuth0ClientSecretRotationSchema,
    generatedCredentialsSchema: Auth0ClientSecretRotationGeneratedCredentialsSchema
  });
