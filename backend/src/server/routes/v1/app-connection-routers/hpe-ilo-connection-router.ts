import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateHpeIloConnectionSchema,
  SanitizedHpeIloConnectionSchema,
  UpdateHpeIloConnectionSchema
} from "@app/services/app-connection/hpe-ilo";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerHpeIloConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.HpeIloRedFish,
    server,
    sanitizedResponseSchema: SanitizedHpeIloConnectionSchema,
    createSchema: CreateHpeIloConnectionSchema,
    updateSchema: UpdateHpeIloConnectionSchema
  });
};
