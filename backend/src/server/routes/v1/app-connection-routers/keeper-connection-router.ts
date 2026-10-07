import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateKeeperConnectionSchema,
  SanitizedKeeperConnectionSchema,
  UpdateKeeperConnectionSchema
} from "@app/services/app-connection/keeper";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerKeeperConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Keeper,
    server,
    sanitizedResponseSchema: SanitizedKeeperConnectionSchema,
    createSchema: CreateKeeperConnectionSchema,
    updateSchema: UpdateKeeperConnectionSchema
  });
};
