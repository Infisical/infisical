import {
  ConvexAccessKeyRotationGeneratedCredentialsSchema,
  ConvexAccessKeyRotationSchema,
  CreateConvexAccessKeyRotationSchema,
  UpdateConvexAccessKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/convex-access-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerConvexAccessKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.ConvexAccessKey,
    server,
    responseSchema: ConvexAccessKeyRotationSchema,
    createSchema: CreateConvexAccessKeyRotationSchema,
    updateSchema: UpdateConvexAccessKeyRotationSchema,
    generatedCredentialsSchema: ConvexAccessKeyRotationGeneratedCredentialsSchema
  });
