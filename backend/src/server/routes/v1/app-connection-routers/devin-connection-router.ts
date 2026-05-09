import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDevinConnectionSchema,
  SanitizedDevinConnectionSchema,
  UpdateDevinConnectionSchema
} from "@app/services/app-connection/devin";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDevinConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Devin,
    server,
    sanitizedResponseSchema: SanitizedDevinConnectionSchema,
    createSchema: CreateDevinConnectionSchema,
    updateSchema: UpdateDevinConnectionSchema
  });
};
