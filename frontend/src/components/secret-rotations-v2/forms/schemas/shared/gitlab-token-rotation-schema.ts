import { z } from "zod";

import { GitLabTokenScope } from "@app/hooks/api/secretRotationsV2/types/gitlab-service-account-token-rotation";

export const GITLAB_TOKEN_NAME_MAX_LENGTH = 200;
export const GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH = 255;
// two rotation intervals plus padding must fit in GitLab's default maximum token lifetime of 365 days
export const GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS = 180;

export const GitLabTokenRotationParametersSchema = z.object({
  groupId: z.string().trim().min(1, "Group required"),
  name: z.string().trim().min(1, "Token name required").max(GITLAB_TOKEN_NAME_MAX_LENGTH),
  description: z.string().trim().max(GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH).optional(),
  scopes: z.nativeEnum(GitLabTokenScope).array().min(1, "At least one scope is required")
});

export const GitLabTokenRotationSecretsMappingSchema = z.object({
  tokenId: z.string().trim().min(1, "Token ID secret name required"),
  token: z.string().trim().min(1, "Token secret name required")
});

export const GitLabTokenRotationIntervalSchema = z.coerce
  .number()
  .max(
    GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS,
    `GitLab tokens expire within 365 days, so the interval can be at most ${GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS} days`
  );
