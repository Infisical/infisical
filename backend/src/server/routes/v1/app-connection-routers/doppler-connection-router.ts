import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDopplerConnectionSchema,
  SanitizedDopplerConnectionSchema,
  UpdateDopplerConnectionSchema
} from "@app/services/app-connection/doppler/doppler-connection-schema";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDopplerConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Doppler,
    server,
    sanitizedResponseSchema: SanitizedDopplerConnectionSchema,
    createSchema: CreateDopplerConnectionSchema,
    updateSchema: UpdateDopplerConnectionSchema
  });
};
