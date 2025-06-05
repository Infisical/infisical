import {
  CreateMySqlCredentialsRotationSchema,
  MySqlCredentialsRotationSchema,
  UpdateMySqlCredentialsRotationSchema
} from "@app/ee/services/secret-rotation-v2/mysql-credentials";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { SqlCredentialsRotationGeneratedCredentialsSchema } from "@app/ee/services/secret-rotation-v2/shared/sql-credentials";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerMySqlCredentialsRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.MySqlCredentials,
    server,
    responseSchema: MySqlCredentialsRotationSchema,
    createSchema: CreateMySqlCredentialsRotationSchema,
    updateSchema: UpdateMySqlCredentialsRotationSchema,
    generatedCredentialsSchema: SqlCredentialsRotationGeneratedCredentialsSchema
  });
