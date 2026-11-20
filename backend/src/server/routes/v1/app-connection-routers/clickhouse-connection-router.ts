import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateClickHouseConnectionSchema,
  SanitizedClickHouseConnectionSchema,
  UpdateClickHouseConnectionSchema
} from "@app/services/app-connection/clickhouse";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerClickHouseConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.ClickHouse,
    server,
    sanitizedResponseSchema: SanitizedClickHouseConnectionSchema,
    createSchema: CreateClickHouseConnectionSchema,
    updateSchema: UpdateClickHouseConnectionSchema
  });
};
