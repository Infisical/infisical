import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateChecklyConnectionSchema,
  SanitizedChecklyConnectionSchema,
  UpdateChecklyConnectionSchema
} from "@app/services/app-connection/checkly";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerChecklyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Checkly,
    server,
    sanitizedResponseSchema: SanitizedChecklyConnectionSchema,
    createSchema: CreateChecklyConnectionSchema,
    updateSchema: UpdateChecklyConnectionSchema
  });
};
