import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import {
  GitLabTokenRotationIntervalSchema,
  GitLabTokenRotationParametersSchema,
  GitLabTokenRotationSecretsMappingSchema
} from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { GitLabTokenAccessLevel } from "@app/hooks/api/secretRotationsV2/types/gitlab-group-access-token-rotation";
import { GitLabTokenScope } from "@app/hooks/api/secretRotationsV2/types/gitlab-service-account-token-rotation";

export const GitLabGroupAccessTokenRotationSchema = z
  .object({
    type: z.literal(SecretRotation.GitLabGroupAccessToken),
    parameters: GitLabTokenRotationParametersSchema.extend({
      scopes: GitLabTokenRotationParametersSchema.shape.scopes.refine(
        (scopes) => !scopes.includes(GitLabTokenScope.ReadUser),
        "Group access tokens cannot have the read_user scope"
      ),
      accessLevel: z.nativeEnum(GitLabTokenAccessLevel)
    }),
    secretsMapping: GitLabTokenRotationSecretsMappingSchema
  })
  .merge(BaseSecretRotationSchema)
  .extend({ rotationInterval: GitLabTokenRotationIntervalSchema });
