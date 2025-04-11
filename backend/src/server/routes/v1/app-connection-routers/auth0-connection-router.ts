import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAuth0ConnectionSchema,
  SanitizedAuth0ConnectionSchema,
  UpdateAuth0ConnectionSchema
} from "@app/services/app-connection/auth0";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAuth0ConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Auth0,
    server,
    sanitizedResponseSchema: SanitizedAuth0ConnectionSchema,
    createSchema: CreateAuth0ConnectionSchema,
    updateSchema: UpdateAuth0ConnectionSchema
  });
};
