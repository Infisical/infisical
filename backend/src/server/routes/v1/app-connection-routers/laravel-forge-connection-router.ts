import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLaravelForgeConnectionSchema,
  SanitizedLaravelForgeConnectionSchema,
  UpdateLaravelForgeConnectionSchema
} from "@app/services/app-connection/laravel-forge";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerLaravelForgeConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.LaravelForge,
    server,
    sanitizedResponseSchema: SanitizedLaravelForgeConnectionSchema,
    createSchema: CreateLaravelForgeConnectionSchema,
    updateSchema: UpdateLaravelForgeConnectionSchema
  });
};
