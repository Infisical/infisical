import {
  CreateDatabricksServicePrincipalSecretRotationSchema,
  DatabricksServicePrincipalSecretRotationGeneratedCredentialsSchema,
  DatabricksServicePrincipalSecretRotationSchema,
  UpdateDatabricksServicePrincipalSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/databricks-service-principal-secret";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerDatabricksServicePrincipalSecretRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.DatabricksServicePrincipalSecret,
    server,
    responseSchema: DatabricksServicePrincipalSecretRotationSchema,
    createSchema: CreateDatabricksServicePrincipalSecretRotationSchema,
    updateSchema: UpdateDatabricksServicePrincipalSecretRotationSchema,
    generatedCredentialsSchema: DatabricksServicePrincipalSecretRotationGeneratedCredentialsSchema
  });
