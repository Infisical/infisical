import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { GitLabConnectionMethod } from "./gitlab-connection-enums";

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
    .describe(AppConnections.CREDENTIALS.GITLAB.instanceUrl)
});

const BaseGitLabConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.GitLab) });

export const GitLabConnectionSchema = BaseGitLabConnectionSchema.extend({
  method: z.literal(GitLabConnectionMethod.AccessToken),
  credentials: GitLabConnectionAccessTokenCredentialsSchema
});

export const SanitizedGitLabConnectionSchema = z.discriminatedUnion("method", [
  BaseGitLabConnectionSchema.extend({
    method: z.literal(GitLabConnectionMethod.AccessToken),
    credentials: GitLabConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  })
]);

export const ValidateGitLabConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(GitLabConnectionMethod.AccessToken).describe(AppConnections.CREATE(AppConnection.GitLab).method),
    credentials: GitLabConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GitLab).credentials
    )
  })
]);

export const CreateGitLabConnectionSchema = ValidateGitLabConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GitLab)
);

export const UpdateGitLabConnectionSchema = z
  .object({
    credentials: GitLabConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.GitLab).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.GitLab));

export const GitLabConnectionListItemSchema = z.object({
  name: z.literal("GitLab"),
  app: z.literal(AppConnection.GitLab),
  methods: z.nativeEnum(GitLabConnectionMethod).array()
});
