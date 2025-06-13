import {
  CreateOracleDBConnectionSchema,
  SanitizedOracleDBConnectionSchema,
  UpdateOracleDBConnectionSchema
} from "@app/ee/services/app-connections/oracledb";
import { registerAppConnectionEndpoints } from "@app/server/routes/v1/app-connection-routers/app-connection-endpoints";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const registerOracleDBConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OracleDB,
    server,
    sanitizedResponseSchema: SanitizedOracleDBConnectionSchema,
    createSchema: CreateOracleDBConnectionSchema,
    updateSchema: UpdateOracleDBConnectionSchema
  });
};
