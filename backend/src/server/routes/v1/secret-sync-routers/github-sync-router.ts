import { CreateGitHubSyncSchema, GitHubSyncSchema, UpdateGitHubSyncSchema } from "@app/services/secret-sync/github";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerGitHubSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.GitHub,
    server,
    responseSchema: GitHubSyncSchema,
    createSchema: CreateGitHubSyncSchema,
    updateSchema: UpdateGitHubSyncSchema
  });
