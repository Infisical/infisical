import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GitLabAccessTokenType, GitLabConnectionMethod } from "./gitlab-connection-enums";

export const GitLabConnectionAccessTokenCredentialsSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(1, "Access Token required")
    .describe(AppConnections.CREDENTIALS.GITLAB.accessToken),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .optional()
    .describe(AppConnections.CREDENTIALS.GITLAB.instanceUrl),
  accessTokenType: z.nativeEnum(GitLabAccessTokenType).describe(AppConnections.CREDENTIALS.GITLAB.accessTokenType)
});

export const GitLabConnectionOAuthCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required").describe(AppConnections.CREDENTIALS.GITLAB.code),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .optional()
    .describe(AppConnections.CREDENTIALS.GITLAB.instanceUrl)
});

export const GitLabConnectionOAuthOutputCredentialsSchema = z.object({
  accessToken: z.string().trim(),
  refreshToken: z.string().trim(),
  expiresAt: z.date(),
  tokenType: z.string().optional().default("bearer"),
  createdAt: z.string().optional(),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .optional()
    .describe(AppConnections.CREDENTIALS.GITLAB.instanceUrl)
});

export const GitLabConnectionRefreshTokenCredentialsSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token required"),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .optional()
    .describe(AppConnections.CREDENTIALS.GITLAB.instanceUrl)
});

const BaseGitLabConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.GitLab)
});

export const GitLabConnectionSchema = z.intersection(
  BaseGitLabConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(GitLabConnectionMethod.AccessToken),
      credentials: GitLabConnectionAccessTokenCredentialsSchema
    }),
    z.object({
      method: z.literal(GitLabConnectionMethod.OAuth),
      credentials: GitLabConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedGitLabConnectionSchema = z.discriminatedUnion("method", [
  BaseGitLabConnectionSchema.extend({
    method: z.literal(GitLabConnectionMethod.AccessToken),
    credentials: GitLabConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true,
      accessTokenType: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GitLab]} (Access Token)` })),
  BaseGitLabConnectionSchema.extend({
    method: z.literal(GitLabConnectionMethod.OAuth),
    credentials: GitLabConnectionOAuthOutputCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GitLab]} (OAuth)` }))
]);

export const ValidateGitLabConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(GitLabConnectionMethod.AccessToken).describe(AppConnections.CREATE(AppConnection.GitLab).method),
    credentials: GitLabConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GitLab).credentials
    )
  }),
  z.object({
    method: z.literal(GitLabConnectionMethod.OAuth).describe(AppConnections.CREATE(AppConnection.GitLab).method),
    credentials: z
      .union([
        GitLabConnectionOAuthCredentialsSchema,
        GitLabConnectionRefreshTokenCredentialsSchema,
        GitLabConnectionOAuthOutputCredentialsSchema
      ])
      .describe(AppConnections.CREATE(AppConnection.GitLab).credentials)
  })
]);

export const CreateGitLabConnectionSchema = ValidateGitLabConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GitLab)
);

export const UpdateGitLabConnectionSchema = z
  .object({
    credentials: z
      .union([
        GitLabConnectionAccessTokenCredentialsSchema,
        GitLabConnectionOAuthOutputCredentialsSchema,
        GitLabConnectionRefreshTokenCredentialsSchema,
        GitLabConnectionOAuthCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.GitLab).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.GitLab));

export const GitLabConnectionListItemSchema = z
  .object({
    name: z.literal("GitLab"),
    app: z.literal(AppConnection.GitLab),
    methods: z.nativeEnum(GitLabConnectionMethod).array(),
    oauthClientId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.GitLab] }));
