import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSalesforceConnectionSchema,
  SanitizedSalesforceConnectionSchema,
  UpdateSalesforceConnectionSchema
} from "@app/services/app-connection/salesforce";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSalesforceConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Salesforce,
    server,
    sanitizedResponseSchema: SanitizedSalesforceConnectionSchema,
    createSchema: CreateSalesforceConnectionSchema,
    updateSchema: UpdateSalesforceConnectionSchema
  });
};
