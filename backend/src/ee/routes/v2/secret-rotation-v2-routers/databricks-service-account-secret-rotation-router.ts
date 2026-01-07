import {
  CreateDatabricksServiceAccountSecretRotationSchema,
  DatabricksServiceAccountSecretRotationGeneratedCredentialsSchema,
  DatabricksServiceAccountSecretRotationSchema,
  UpdateDatabricksServiceAccountSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/databricks-service-account-secret";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerDatabricksServiceAccountSecretRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.DatabricksServiceAccountSecret,
    server,
    responseSchema: DatabricksServiceAccountSecretRotationSchema,
    createSchema: CreateDatabricksServiceAccountSecretRotationSchema,
    updateSchema: UpdateDatabricksServiceAccountSecretRotationSchema,
    generatedCredentialsSchema: DatabricksServiceAccountSecretRotationGeneratedCredentialsSchema
  });
