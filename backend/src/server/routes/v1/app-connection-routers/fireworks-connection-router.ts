import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateFireworksConnectionSchema,
  SanitizedFireworksConnectionSchema,
  UpdateFireworksConnectionSchema
} from "@app/services/app-connection/fireworks";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerFireworksConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Fireworks,
    server,
    sanitizedResponseSchema: SanitizedFireworksConnectionSchema,
    createSchema: CreateFireworksConnectionSchema,
    updateSchema: UpdateFireworksConnectionSchema
  });
};
