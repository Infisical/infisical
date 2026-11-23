import { z } from "zod";

import { SecretRotations } from "@app/lib/api-docs";

import {
  GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH,
  GITLAB_TOKEN_MAX_LIFETIME_DAYS,
  GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS,
  GITLAB_TOKEN_NAME_MAX_LENGTH,
  GitLabTokenScope
} from "./gitlab-token-rotation-constants";

export const GitLabTokenNameSchema = z
  .string()
  .trim()
  .min(1, "Token name required")
  .max(GITLAB_TOKEN_NAME_MAX_LENGTH, `Token name cannot exceed ${GITLAB_TOKEN_NAME_MAX_LENGTH} characters`);

export const GitLabTokenDescriptionSchema = z
  .string()
  .trim()
  .max(
    GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH,
    `Token description cannot exceed ${GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH} characters`
  );

export const GitLabTokenScopesSchema = z
  .nativeEnum(GitLabTokenScope)
  .array()
  .min(1, "At least one scope is required")
  .refine((scopes) => new Set(scopes).size === scopes.length, "Scopes must be unique");

export const GitLabNumericIdSchema = (field: string) =>
  z
    .string()
    .trim()
    .min(1, `${field} required`)
    .max(20)
    .regex(/^\d+$/, `${field} must be a numeric GitLab ID`)
    // GitLab reads `012` as `12`, so IDs are stored in the form GitLab returns and compare equal to it
    .transform((id) => id.replace(/^0+(?=\d)/, ""));

export const GITLAB_TOKEN_ROTATION_INTERVAL_ERROR = `GitLab tokens can expire at most ${GITLAB_TOKEN_MAX_LIFETIME_DAYS} days after they are created, so the rotation interval cannot exceed ${GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS} days.`;

export const GitLabTokenRotationIntervalSchema = z.coerce
  .number()
  .int("The rotation interval must be a whole number of days")
  .min(1)
  .max(GITLAB_TOKEN_MAX_ROTATION_INTERVAL_DAYS, GITLAB_TOKEN_ROTATION_INTERVAL_ERROR);

export const GitLabTokenGeneratedCredentialsSchema = z
  .object({
    tokenId: z.string().describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.tokenId),
    token: z.string().describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.token),
    settings: z
      .object({
        name: z.string().describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.name),
        description: z.string().optional().describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.description),
        scopes: z.string().array().describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.scopes),
        accessLevel: z.number().optional().describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.accessLevel)
      })
      .optional()
      .describe(SecretRotations.GENERATED_CREDENTIALS.GITLAB_TOKEN.settings)
  })
  .array()
  .min(1)
  .max(2);
