import {
  CreateGitLabGroupAccessTokenRotationSchema,
  GitLabGroupAccessTokenRotationGeneratedCredentialsSchema,
  GitLabGroupAccessTokenRotationSchema,
  UpdateGitLabGroupAccessTokenRotationSchema
} from "@app/ee/services/secret-rotation-v2/gitlab-group-access-token";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerGitLabGroupAccessTokenRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.GitLabGroupAccessToken,
    server,
    responseSchema: GitLabGroupAccessTokenRotationSchema,
    createSchema: CreateGitLabGroupAccessTokenRotationSchema,
    updateSchema: UpdateGitLabGroupAccessTokenRotationSchema,
    generatedCredentialsSchema: GitLabGroupAccessTokenRotationGeneratedCredentialsSchema
  });
