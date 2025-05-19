import { registerGitHubSecretScanningRouter } from "@app/ee/routes/v2/secret-scanning-v2-routers/github-secret-scanning-router";
import { registerGitLabSecretScanningRouter } from "@app/ee/routes/v2/secret-scanning-v2-routers/gitlab-secret-scanning-router";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export * from "./secret-scanning-v2-router";

export const SECRET_SCANNING_REGISTER_ROUTER_MAP: Record<
  SecretScanningDataSource,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [SecretScanningDataSource.GitLab]: registerGitLabSecretScanningRouter,
  [SecretScanningDataSource.GitHub]: registerGitHubSecretScanningRouter
};
