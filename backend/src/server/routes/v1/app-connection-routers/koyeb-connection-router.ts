import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateKoyebConnectionSchema,
  SanitizedKoyebConnectionSchema,
  UpdateKoyebConnectionSchema
} from "@app/services/app-connection/koyeb/koyeb-connection-schema";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerKoyebConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Koyeb,
    server,
    sanitizedResponseSchema: SanitizedKoyebConnectionSchema,
    createSchema: CreateKoyebConnectionSchema,
    updateSchema: UpdateKoyebConnectionSchema
  });
};
