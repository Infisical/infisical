import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  GitLabNumericIdSchema,
  GitLabTokenDescriptionSchema,
  GitLabTokenGeneratedCredentialsSchema,
  GitLabTokenNameSchema,
  GitLabTokenRotationIntervalSchema,
  GitLabTokenScopesSchema
} from "@app/ee/services/secret-rotation-v2/shared/gitlab-token";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitLabServiceAccountTokenRotationGeneratedCredentialsSchema = GitLabTokenGeneratedCredentialsSchema;

const GitLabServiceAccountTokenRotationParametersSchema = z.object({
  groupId: GitLabNumericIdSchema("Group ID").describe(SecretRotations.PARAMETERS.GITLAB_SERVICE_ACCOUNT_TOKEN.groupId),
  serviceAccountId: GitLabNumericIdSchema("Service account ID").describe(
    SecretRotations.PARAMETERS.GITLAB_SERVICE_ACCOUNT_TOKEN.serviceAccountId
  ),
  name: GitLabTokenNameSchema.describe(SecretRotations.PARAMETERS.GITLAB_SERVICE_ACCOUNT_TOKEN.name),
  description: GitLabTokenDescriptionSchema.optional().describe(
    SecretRotations.PARAMETERS.GITLAB_SERVICE_ACCOUNT_TOKEN.description
  ),
  scopes: GitLabTokenScopesSchema.describe(SecretRotations.PARAMETERS.GITLAB_SERVICE_ACCOUNT_TOKEN.scopes)
});

const GitLabServiceAccountTokenRotationSecretsMappingSchema = z.object({
  tokenId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.GITLAB_SERVICE_ACCOUNT_TOKEN.tokenId),
  token: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.GITLAB_SERVICE_ACCOUNT_TOKEN.token)
});

export const GitLabServiceAccountTokenRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    tokenId: z.string(),
    token: z.string()
  })
});

export const GitLabServiceAccountTokenRotationSchema = BaseSecretRotationSchema(
  SecretRotation.GitLabServiceAccountToken
).extend({
  type: z.literal(SecretRotation.GitLabServiceAccountToken),
  parameters: GitLabServiceAccountTokenRotationParametersSchema,
  secretsMapping: GitLabServiceAccountTokenRotationSecretsMappingSchema
});

export const CreateGitLabServiceAccountTokenRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.GitLabServiceAccountToken
).extend({
  rotationInterval: GitLabTokenRotationIntervalSchema.describe(
    SecretRotations.CREATE(SecretRotation.GitLabServiceAccountToken).rotationInterval
  ),
  parameters: GitLabServiceAccountTokenRotationParametersSchema,
  secretsMapping: GitLabServiceAccountTokenRotationSecretsMappingSchema
});

export const UpdateGitLabServiceAccountTokenRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.GitLabServiceAccountToken
).extend({
  rotationInterval: GitLabTokenRotationIntervalSchema.optional().describe(
    SecretRotations.UPDATE(SecretRotation.GitLabServiceAccountToken).rotationInterval
  ),
  parameters: GitLabServiceAccountTokenRotationParametersSchema.optional(),
  secretsMapping: GitLabServiceAccountTokenRotationSecretsMappingSchema.optional()
});

export const GitLabServiceAccountTokenRotationListItemSchema = z.object({
  name: z.literal("GitLab Service Account Token"),
  connection: z.literal(AppConnection.GitLab),
  type: z.literal(SecretRotation.GitLabServiceAccountToken),
  template: GitLabServiceAccountTokenRotationTemplateSchema
});
