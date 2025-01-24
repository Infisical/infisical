import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGcpConnectionSchema,
  SanitizedGcpConnectionSchema,
  UpdateGcpConnectionSchema
} from "@app/services/app-connection/gcp";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGcpConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.GCP,
    server,
    sanitizedResponseSchema: SanitizedGcpConnectionSchema,
    createSchema: CreateGcpConnectionSchema,
    updateSchema: UpdateGcpConnectionSchema
  });
