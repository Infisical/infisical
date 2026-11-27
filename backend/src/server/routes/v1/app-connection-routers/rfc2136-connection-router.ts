import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRfc2136ConnectionSchema,
  SanitizedRfc2136ConnectionSchema,
  UpdateRfc2136ConnectionSchema
} from "@app/services/app-connection/rfc2136";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRfc2136ConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Rfc2136,
    server,
    sanitizedResponseSchema: SanitizedRfc2136ConnectionSchema,
    createSchema: CreateRfc2136ConnectionSchema,
    updateSchema: UpdateRfc2136ConnectionSchema
  });
};
