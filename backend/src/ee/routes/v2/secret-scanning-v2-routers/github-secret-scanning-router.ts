import { registerSecretScanningEndpoints } from "@app/ee/routes/v2/secret-scanning-v2-routers/secret-scanning-v2-endpoints";
import {
  CreateGitHubSecretScanningDataSourceSchema,
  GitHubSecretScanningDataSourceSchema,
  UpdateGitHubSecretScanningDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/github";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export const registerGitHubSecretScanningRouter = async (server: FastifyZodProvider) =>
  registerSecretScanningEndpoints({
    type: SecretScanningDataSource.GitHub,
    server,
    responseSchema: GitHubSecretScanningDataSourceSchema,
    createSchema: CreateGitHubSecretScanningDataSourceSchema,
    updateSchema: UpdateGitHubSecretScanningDataSourceSchema
  });
