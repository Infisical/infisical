import { registerGitLabSecretScanningRouter } from "@app/ee/routes/v2/secret-scanning-v2-routers/gitlab-secret-scanning-router";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { registerBitbucketSecretScanningRouter } from "./bitbucket-secret-scanning-router";
import { registerGitHubSecretScanningRouter } from "./github-secret-scanning-router";

export * from "./secret-scanning-v2-router";

export const SECRET_SCANNING_REGISTER_ROUTER_MAP: Record<
  SecretScanningDataSource,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [SecretScanningDataSource.GitHub]: registerGitHubSecretScanningRouter,
  [SecretScanningDataSource.Bitbucket]: registerBitbucketSecretScanningRouter,
  [SecretScanningDataSource.GitLab]: registerGitLabSecretScanningRouter
};
