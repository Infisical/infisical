import {
  CreatePostgresLoginCredentialsRotationSchema,
  PostgresLoginCredentialsRotationSchema,
  UpdatePostgresLoginCredentialsRotationSchema
} from "@app/ee/services/secret-rotation-v2/postgres-login-credentials";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerPostgresLoginCredentialsRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.PostgresLoginCredentials,
    server,
    responseSchema: PostgresLoginCredentialsRotationSchema,
    createSchema: CreatePostgresLoginCredentialsRotationSchema,
    updateSchema: UpdatePostgresLoginCredentialsRotationSchema
  });
