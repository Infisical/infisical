import { registerSecretScanningEndpoints } from "@app/ee/routes/v2/secret-scanning-v2-routers/secret-scanning-v2-endpoints";
import {
  CreateGitLabDataSourceSchema,
  GitLabDataSourceSchema,
  UpdateGitLabDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/gitlab";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export const registerGitLabSecretScanningRouter = async (server: FastifyZodProvider) =>
  registerSecretScanningEndpoints({
    type: SecretScanningDataSource.GitLab,
    server,
    responseSchema: GitLabDataSourceSchema,
    createSchema: CreateGitLabDataSourceSchema,
    updateSchema: UpdateGitLabDataSourceSchema
  });
