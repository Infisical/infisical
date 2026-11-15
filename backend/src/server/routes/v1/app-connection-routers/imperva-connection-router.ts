import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateImpervaConnectionSchema,
  SanitizedImpervaConnectionSchema,
  UpdateImpervaConnectionSchema
} from "@app/services/app-connection/imperva";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerImpervaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Imperva,
    server,
    sanitizedResponseSchema: SanitizedImpervaConnectionSchema,
    createSchema: CreateImpervaConnectionSchema,
    updateSchema: UpdateImpervaConnectionSchema
  });
};
