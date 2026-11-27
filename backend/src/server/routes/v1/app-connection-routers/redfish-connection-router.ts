import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRedfishConnectionSchema,
  SanitizedRedfishConnectionSchema,
  UpdateRedfishConnectionSchema
} from "@app/services/app-connection/redfish";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRedfishConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Redfish,
    server,
    sanitizedResponseSchema: SanitizedRedfishConnectionSchema,
    createSchema: CreateRedfishConnectionSchema,
    updateSchema: UpdateRedfishConnectionSchema
  });
};
