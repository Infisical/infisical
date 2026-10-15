import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateJiraConnectionSchema,
  SanitizedJiraConnectionSchema,
  UpdateJiraConnectionSchema
} from "@app/services/app-connection/jira";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerJiraConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Jira,
    server,
    sanitizedResponseSchema: SanitizedJiraConnectionSchema,
    createSchema: CreateJiraConnectionSchema,
    updateSchema: UpdateJiraConnectionSchema
  });
};
