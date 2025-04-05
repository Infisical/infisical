import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreatePostgresConnectionSchema,
  SanitizedPostgresConnectionSchema,
  UpdatePostgresConnectionSchema
} from "@app/services/app-connection/postgres";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerPostgresConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Postgres,
    server,
    sanitizedResponseSchema: SanitizedPostgresConnectionSchema,
    createSchema: CreatePostgresConnectionSchema,
    updateSchema: UpdatePostgresConnectionSchema
  });
};
