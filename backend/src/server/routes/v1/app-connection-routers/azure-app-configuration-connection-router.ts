import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureAppConfigurationConnectionSchema,
  SanitizedAzureAppConfigurationConnectionSchema,
  UpdateAzureAppConfigurationConnectionSchema
} from "@app/services/app-connection/azure-app-configuration";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureAppConfigurationConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureAppConfiguration,
    server,
    sanitizedResponseSchema: SanitizedAzureAppConfigurationConnectionSchema,
    createSchema: CreateAzureAppConfigurationConnectionSchema,
    updateSchema: UpdateAzureAppConfigurationConnectionSchema
  });
};
