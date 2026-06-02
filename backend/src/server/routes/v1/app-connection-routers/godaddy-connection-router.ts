import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGoDaddyConnectionSchema,
  SanitizedGoDaddyConnectionSchema,
  UpdateGoDaddyConnectionSchema
} from "@app/services/app-connection/godaddy";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGoDaddyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GoDaddy,
    server,
    sanitizedResponseSchema: SanitizedGoDaddyConnectionSchema,
    createSchema: CreateGoDaddyConnectionSchema,
    updateSchema: UpdateGoDaddyConnectionSchema
  });
};
