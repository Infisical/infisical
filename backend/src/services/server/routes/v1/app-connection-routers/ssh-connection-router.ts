import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSshConnectionSchema,
  SanitizedSshConnectionSchema,
  UpdateSshConnectionSchema
} from "@app/services/app-connection/ssh";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSshConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.SSH,
    server,
    sanitizedResponseSchema: SanitizedSshConnectionSchema,
    createSchema: CreateSshConnectionSchema,
    updateSchema: UpdateSshConnectionSchema
  });
};
