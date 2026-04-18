import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateServiceNowConnectionSchema,
  SanitizedServiceNowConnectionSchema,
  UpdateServiceNowConnectionSchema
} from "@app/services/app-connection/service-now";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerServiceNowConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.ServiceNow,
    server,
    sanitizedResponseSchema: SanitizedServiceNowConnectionSchema,
    createSchema: CreateServiceNowConnectionSchema,
    updateSchema: UpdateServiceNowConnectionSchema
  });
};
