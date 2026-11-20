import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  GITLAB_PERSONAL_ACCESS_TOKEN_ONLY_SCOPES,
  GitLabNumericIdSchema,
  GitLabTokenAccessLevel,
  GitLabTokenDescriptionSchema,
  GitLabTokenGeneratedCredentialsSchema,
  GitLabTokenNameSchema,
  GitLabTokenRotationIntervalSchema,
  GitLabTokenScopesSchema
} from "@app/ee/services/secret-rotation-v2/shared/gitlab-token";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitLabGroupAccessTokenRotationGeneratedCredentialsSchema = GitLabTokenGeneratedCredentialsSchema;

const GitLabGroupAccessTokenRotationParametersSchema = z.object({
  groupId: GitLabNumericIdSchema("Group ID").describe(SecretRotations.PARAMETERS.GITLAB_GROUP_ACCESS_TOKEN.groupId),
  name: GitLabTokenNameSchema.describe(SecretRotations.PARAMETERS.GITLAB_GROUP_ACCESS_TOKEN.name),
  description: GitLabTokenDescriptionSchema.optional().describe(
    SecretRotations.PARAMETERS.GITLAB_GROUP_ACCESS_TOKEN.description
  ),
  scopes: GitLabTokenScopesSchema.refine(
    (scopes) => !scopes.some((scope) => GITLAB_PERSONAL_ACCESS_TOKEN_ONLY_SCOPES.includes(scope)),
    `Group access tokens cannot have the ${GITLAB_PERSONAL_ACCESS_TOKEN_ONLY_SCOPES.join(", ")} scope`
  ).describe(SecretRotations.PARAMETERS.GITLAB_GROUP_ACCESS_TOKEN.scopes),
  accessLevel: z
    .nativeEnum(GitLabTokenAccessLevel)
    .refine((level) => level !== GitLabTokenAccessLevel.Owner, "Group access tokens cannot have the Owner role")
    .default(GitLabTokenAccessLevel.Maintainer)
    .describe(SecretRotations.PARAMETERS.GITLAB_GROUP_ACCESS_TOKEN.accessLevel)
});

const GitLabGroupAccessTokenRotationSecretsMappingSchema = z.object({
  tokenId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.GITLAB_GROUP_ACCESS_TOKEN.tokenId),
  token: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.GITLAB_GROUP_ACCESS_TOKEN.token)
});

export const GitLabGroupAccessTokenRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    tokenId: z.string(),
    token: z.string()
  })
});

export const GitLabGroupAccessTokenRotationSchema = BaseSecretRotationSchema(
  SecretRotation.GitLabGroupAccessToken
).extend({
  type: z.literal(SecretRotation.GitLabGroupAccessToken),
  parameters: GitLabGroupAccessTokenRotationParametersSchema,
  secretsMapping: GitLabGroupAccessTokenRotationSecretsMappingSchema
});

export const CreateGitLabGroupAccessTokenRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.GitLabGroupAccessToken
).extend({
  rotationInterval: GitLabTokenRotationIntervalSchema.describe(
    SecretRotations.CREATE(SecretRotation.GitLabGroupAccessToken).rotationInterval
  ),
  parameters: GitLabGroupAccessTokenRotationParametersSchema,
  secretsMapping: GitLabGroupAccessTokenRotationSecretsMappingSchema
});

export const UpdateGitLabGroupAccessTokenRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.GitLabGroupAccessToken
).extend({
  rotationInterval: GitLabTokenRotationIntervalSchema.optional().describe(
    SecretRotations.UPDATE(SecretRotation.GitLabGroupAccessToken).rotationInterval
  ),
  parameters: GitLabGroupAccessTokenRotationParametersSchema.optional(),
  secretsMapping: GitLabGroupAccessTokenRotationSecretsMappingSchema.optional()
});

export const GitLabGroupAccessTokenRotationListItemSchema = z.object({
  name: z.literal("GitLab Group Access Token"),
  connection: z.literal(AppConnection.GitLab),
  type: z.literal(SecretRotation.GitLabGroupAccessToken),
  template: GitLabGroupAccessTokenRotationTemplateSchema
});
