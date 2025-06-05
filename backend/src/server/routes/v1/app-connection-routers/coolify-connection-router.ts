import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCoolifyConnectionSchema,
  SanitizedCoolifyConnectionSchema,
  UpdateCoolifyConnectionSchema
} from "@app/services/app-connection/coolify";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCoolifyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Coolify,
    server,
    sanitizedResponseSchema: SanitizedCoolifyConnectionSchema,
    createSchema: CreateCoolifyConnectionSchema,
    updateSchema: UpdateCoolifyConnectionSchema
  });
};
