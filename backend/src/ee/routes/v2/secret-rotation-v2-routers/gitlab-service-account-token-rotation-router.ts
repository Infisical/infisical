import {
  CreateGitLabServiceAccountTokenRotationSchema,
  GitLabServiceAccountTokenRotationGeneratedCredentialsSchema,
  GitLabServiceAccountTokenRotationSchema,
  UpdateGitLabServiceAccountTokenRotationSchema
} from "@app/ee/services/secret-rotation-v2/gitlab-service-account-token";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerGitLabServiceAccountTokenRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.GitLabServiceAccountToken,
    server,
    responseSchema: GitLabServiceAccountTokenRotationSchema,
    createSchema: CreateGitLabServiceAccountTokenRotationSchema,
    updateSchema: UpdateGitLabServiceAccountTokenRotationSchema,
    generatedCredentialsSchema: GitLabServiceAccountTokenRotationGeneratedCredentialsSchema
  });
