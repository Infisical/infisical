import {
  CreateRedisCredentialsRotationSchema,
  RedisCredentialsRotationGeneratedCredentialsSchema,
  RedisCredentialsRotationSchema,
  UpdateRedisCredentialsRotationSchema
} from "@app/ee/services/secret-rotation-v2/redis-credentials";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerRedisCredentialsRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.RedisCredentials,
    server,
    responseSchema: RedisCredentialsRotationSchema,
    createSchema: CreateRedisCredentialsRotationSchema,
    updateSchema: UpdateRedisCredentialsRotationSchema,
    generatedCredentialsSchema: RedisCredentialsRotationGeneratedCredentialsSchema
  });
