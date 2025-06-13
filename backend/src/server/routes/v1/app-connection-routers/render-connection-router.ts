import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRenderConnectionSchema,
  SanitizedRenderConnectionSchema,
  UpdateRenderConnectionSchema
} from "@app/services/app-connection/render/render-connection-schema";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRenderConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Render,
    server,
    sanitizedResponseSchema: SanitizedRenderConnectionSchema,
    createSchema: CreateRenderConnectionSchema,
    updateSchema: UpdateRenderConnectionSchema
  });
};
