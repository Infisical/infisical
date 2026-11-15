import {
  ClickHouseCredentialsRotationGeneratedCredentialsSchema,
  ClickHouseCredentialsRotationSchema,
  CreateClickHouseCredentialsRotationSchema,
  UpdateClickHouseCredentialsRotationSchema
} from "@app/ee/services/secret-rotation-v2/clickhouse-credentials";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerClickHouseCredentialsRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.ClickHouseCredentials,
    server,
    responseSchema: ClickHouseCredentialsRotationSchema,
    createSchema: CreateClickHouseCredentialsRotationSchema,
    updateSchema: UpdateClickHouseCredentialsRotationSchema,
    generatedCredentialsSchema: ClickHouseCredentialsRotationGeneratedCredentialsSchema
  });
