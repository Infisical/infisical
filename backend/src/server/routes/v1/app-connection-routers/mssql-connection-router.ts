import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateMsSqlConnectionSchema,
  SanitizedMsSqlConnectionSchema,
  UpdateMsSqlConnectionSchema
} from "@app/services/app-connection/mssql";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerMsSqlConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.MsSql,
    server,
    sanitizedResponseSchema: SanitizedMsSqlConnectionSchema,
    createSchema: CreateMsSqlConnectionSchema,
    updateSchema: UpdateMsSqlConnectionSchema
  });
};
