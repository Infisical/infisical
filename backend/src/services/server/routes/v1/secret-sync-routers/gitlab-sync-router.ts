import { CreateGitLabSyncSchema, GitLabSyncSchema, UpdateGitLabSyncSchema } from "@app/services/secret-sync/gitlab";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerGitLabSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.GitLab,
    server,
    responseSchema: GitLabSyncSchema,
    createSchema: CreateGitLabSyncSchema,
    updateSchema: UpdateGitLabSyncSchema
  });
