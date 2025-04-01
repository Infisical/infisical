import {
  CreateMsSqlCredentialsRotationSchema,
  MsSqlCredentialsRotationSchema,
  UpdateMsSqlCredentialsRotationSchema
} from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { SqlCredentialsRotationGeneratedCredentialsSchema } from "@app/ee/services/secret-rotation-v2/shared/sql-credentials";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerMsSqlCredentialsRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.MsSqlCredentials,
    server,
    responseSchema: MsSqlCredentialsRotationSchema,
    createSchema: CreateMsSqlCredentialsRotationSchema,
    updateSchema: UpdateMsSqlCredentialsRotationSchema,
    generatedCredentialsSchema: SqlCredentialsRotationGeneratedCredentialsSchema
  });
