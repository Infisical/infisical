import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureClientSecretsConnectionSchema,
  SanitizedAzureClientSecretsConnectionSchema,
  UpdateAzureClientSecretsConnectionSchema
} from "@app/services/app-connection/azure-client-secrets";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureClientSecretsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureClientSecrets,
    server,
    sanitizedResponseSchema: SanitizedAzureClientSecretsConnectionSchema,
    createSchema: CreateAzureClientSecretsConnectionSchema,
    updateSchema: UpdateAzureClientSecretsConnectionSchema
  });
};
