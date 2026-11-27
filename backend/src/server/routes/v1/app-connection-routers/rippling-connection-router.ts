import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRipplingConnectionSchema,
  SanitizedRipplingConnectionSchema,
  UpdateRipplingConnectionSchema
} from "@app/services/app-connection/rippling";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRipplingConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Rippling,
    server,
    sanitizedResponseSchema: SanitizedRipplingConnectionSchema,
    createSchema: CreateRipplingConnectionSchema,
    updateSchema: UpdateRipplingConnectionSchema
  });
};
