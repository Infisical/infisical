import { z } from "zod";

import { isValidEmail } from "@app/helpers/email";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitLabAccessTokenType } from "@app/hooks/api/appConnections/gitlab/types";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { GitHubRadarConnectionMethod } from "@app/hooks/api/appConnections/types/github-radar-connection";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";
import { PostgresConnectionMethod } from "@app/hooks/api/appConnections/types/postgres-connection";

import {
  BaseSqlUsernameAndPasswordConnectionSchema,
  genericAppConnectionFieldsSchema
} from "./base";

const awsRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AWS)
});

export const awsConnectionFormSchema = z.discriminatedUnion("method", [
  awsRootSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: z.object({
      roleArn: z.string().trim().min(1, "Role ARN required"),
      stsEndpoint: z
        .string()
        .trim()
        .url("Must be a valid URL")
        .startsWith("https://", "Must use HTTPS")
        .or(z.literal(""))
        .optional()
        .transform((val) => val || undefined)
    })
  }),
  awsRootSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
    })
  })
]);

const gitHubRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHub),
  method: z.nativeEnum(GitHubConnectionMethod)
});

const gitHubBaseCredentialsSchema = z.union([
  z.object({
    instanceType: z.literal("server"),
    host: z.string().min(1, "Host is required for server instance type")
  }),
  z.object({
    instanceType: z.literal("cloud").optional(),
    host: z.string().optional()
  })
]);

const gitHubAppSchema = gitHubRootSchema.extend({
  method: z.literal(GitHubConnectionMethod.App),
  credentials: gitHubBaseCredentialsSchema
});

const gitHubOAuthSchema = gitHubRootSchema.extend({
  method: z.literal(GitHubConnectionMethod.OAuth),
  credentials: gitHubBaseCredentialsSchema
});

export const gitHubPatConnectionFormSchema = gitHubRootSchema.extend({
  method: z.literal(GitHubConnectionMethod.Pat),
  credentials: z.union([
    z.object({
      instanceType: z.literal("server"),
      host: z.string().min(1, "Host is required for server instance type"),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    }),
    z.object({
      instanceType: z.literal("cloud").optional(),
      host: z.string().optional(),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    })
  ])
});

export const gitHubConnectionFormSchema = z.discriminatedUnion("method", [
  gitHubAppSchema,
  gitHubOAuthSchema,
  gitHubPatConnectionFormSchema
]);

export const gitHubRadarConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHubRadar),
  method: z.nativeEnum(GitHubRadarConnectionMethod)
});

const postgresRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Postgres),
  isPlatformManagedCredentials: z.boolean().optional()
});

export const postgresConnectionFormSchema = z.discriminatedUnion("method", [
  postgresRootSchema.extend({
    method: z.literal(PostgresConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

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
