import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureADCSConnectionSchema,
  SanitizedAzureADCSConnectionSchema,
  UpdateAzureADCSConnectionSchema
} from "@app/services/app-connection/azure-adcs";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureADCSConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureADCS,
    server,
    sanitizedResponseSchema: SanitizedAzureADCSConnectionSchema,
    createSchema: CreateAzureADCSConnectionSchema,
    updateSchema: UpdateAzureADCSConnectionSchema
  });
};
