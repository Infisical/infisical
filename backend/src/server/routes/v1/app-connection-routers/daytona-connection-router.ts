import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDaytonaConnectionSchema,
  SanitizedDaytonaConnectionSchema,
  UpdateDaytonaConnectionSchema
} from "@app/services/app-connection/daytona";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDaytonaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Daytona,
    server,
    sanitizedResponseSchema: SanitizedDaytonaConnectionSchema,
    createSchema: CreateDaytonaConnectionSchema,
    updateSchema: UpdateDaytonaConnectionSchema
  });
};
