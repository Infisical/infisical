import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRedisConnectionSchema,
  SanitizedRedisConnectionSchema,
  UpdateRedisConnectionSchema
} from "@app/services/app-connection/redis";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRedisConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Redis,
    server,
    sanitizedResponseSchema: SanitizedRedisConnectionSchema,
    createSchema: CreateRedisConnectionSchema,
    updateSchema: UpdateRedisConnectionSchema
  });
};
