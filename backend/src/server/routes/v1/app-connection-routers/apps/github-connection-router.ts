import { AppConnection } from "@app/lib/app-connections";
import {
  CreateGitHubConnectionSchema,
  GitHubAppConnectionSchema,
  UpdateGitHubConnectionSchema
} from "@app/lib/app-connections/github";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGitHubConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.GitHub,
    server,
    responseSchema: GitHubAppConnectionSchema,
    createSchema: CreateGitHubConnectionSchema,
    updateSchema: UpdateGitHubConnectionSchema
  });
