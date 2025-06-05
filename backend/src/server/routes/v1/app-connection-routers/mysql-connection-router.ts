import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateMySqlConnectionSchema,
  SanitizedMySqlConnectionSchema,
  UpdateMySqlConnectionSchema
} from "@app/services/app-connection/mysql";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerMySqlConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.MySql,
    server,
    sanitizedResponseSchema: SanitizedMySqlConnectionSchema,
    createSchema: CreateMySqlConnectionSchema,
    updateSchema: UpdateMySqlConnectionSchema
  });
};
