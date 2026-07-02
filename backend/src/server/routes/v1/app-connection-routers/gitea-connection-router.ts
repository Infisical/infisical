import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGiteaConnectionSchema,
  SanitizedGiteaConnectionSchema,
  UpdateGiteaConnectionSchema
} from "@app/services/app-connection/gitea";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGiteaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Gitea,
    server,
    sanitizedResponseSchema: SanitizedGiteaConnectionSchema,
    createSchema: CreateGiteaConnectionSchema,
    updateSchema: UpdateGiteaConnectionSchema
  });
};
