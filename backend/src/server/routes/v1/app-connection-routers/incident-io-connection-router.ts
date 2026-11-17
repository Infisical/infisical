import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateIncidentIoConnectionSchema,
  SanitizedIncidentIoConnectionSchema,
  UpdateIncidentIoConnectionSchema
} from "@app/services/app-connection/incident-io";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerIncidentIoConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.IncidentIo,
    server,
    sanitizedResponseSchema: SanitizedIncidentIoConnectionSchema,
    createSchema: CreateIncidentIoConnectionSchema,
    updateSchema: UpdateIncidentIoConnectionSchema
  });
};
