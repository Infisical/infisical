import {
  CreateGitHubConnectionSchema,
  SanitizedGitHubConnectionSchema,
  UpdateGitHubConnectionSchema
} from "src/services/app-connection/github";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGitHubConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.GitHub,
    server,
    responseSchema: SanitizedGitHubConnectionSchema,
    createSchema: CreateGitHubConnectionSchema,
    updateSchema: UpdateGitHubConnectionSchema
  });
