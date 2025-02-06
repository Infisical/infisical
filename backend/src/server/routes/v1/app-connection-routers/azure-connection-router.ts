import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureConnectionSchema,
  SanitizedAzureConnectionSchema,
  UpdateAzureConnectionSchema
} from "@app/services/app-connection/azure";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Azure,
    server,
    sanitizedResponseSchema: SanitizedAzureConnectionSchema,
    createSchema: CreateAzureConnectionSchema,
    updateSchema: UpdateAzureConnectionSchema
  });
};
