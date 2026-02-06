import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateMongoDBConnectionSchema,
  SanitizedMongoDBConnectionSchema,
  UpdateMongoDBConnectionSchema
} from "@app/services/app-connection/mongodb";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerMongoDBConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.MongoDB,
    server,
    sanitizedResponseSchema: SanitizedMongoDBConnectionSchema,
    createSchema: CreateMongoDBConnectionSchema,
    updateSchema: UpdateMongoDBConnectionSchema
  });
};
