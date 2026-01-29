import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOpenRouterConnectionSchema,
  SanitizedOpenRouterConnectionSchema,
  UpdateOpenRouterConnectionSchema
} from "@app/services/app-connection/open-router";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOpenRouterConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OpenRouter,
    server,
    sanitizedResponseSchema: SanitizedOpenRouterConnectionSchema,
    createSchema: CreateOpenRouterConnectionSchema,
    updateSchema: UpdateOpenRouterConnectionSchema
  });
};
