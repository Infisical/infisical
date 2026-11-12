import { z } from "zod";

import { isValidEmail } from "@app/helpers/email";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitLabAccessTokenType } from "@app/hooks/api/appConnections/gitlab/types";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";
import { genericAppConnectionFieldsSchema } from "@app/lib/schemas/app-connections";

export const bitbucketApiTokenConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Bitbucket),
  method: z.literal(BitbucketConnectionMethod.ApiToken),
  credentials: z.object({
    email: z.string().trim().min(1, "Email required").refine(isValidEmail, "Enter a valid email"),
    apiToken: z.string().trim().min(1, "API token required")
  })
});

const gitLabInstanceUrlSchema = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .refine((value) => !value || z.string().url().safeParse(value).success, {
    message: "Enter a valid URL"
  })
  .optional();

const gitLabOAuthConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitLab),
  method: z.literal(GitLabConnectionMethod.OAuth),
  credentials: z.object({ instanceUrl: gitLabInstanceUrlSchema })
});

const gitLabAccessTokenConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitLab),
  method: z.literal(GitLabConnectionMethod.AccessToken),
  credentials: z.object({
    instanceUrl: gitLabInstanceUrlSchema,
    accessTokenType: z.nativeEnum(GitLabAccessTokenType),
    accessToken: z.string().min(1, "Access token required")
  })
});

export const gitLabConnectionFormSchema = z.discriminatedUnion("method", [
  gitLabAccessTokenConnectionFormSchema,
  gitLabOAuthConnectionFormSchema
]);
