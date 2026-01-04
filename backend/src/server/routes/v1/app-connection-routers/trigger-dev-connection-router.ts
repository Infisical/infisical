import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateTriggerDevConnectionSchema,
  SanitizedTriggerDevConnectionSchema,
  UpdateTriggerDevConnectionSchema
} from "@app/services/app-connection/trigger-dev";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerTriggerDevConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.TriggerDev,
    server,
    sanitizedResponseSchema: SanitizedTriggerDevConnectionSchema,
    createSchema: CreateTriggerDevConnectionSchema,
    updateSchema: UpdateTriggerDevConnectionSchema
  });
