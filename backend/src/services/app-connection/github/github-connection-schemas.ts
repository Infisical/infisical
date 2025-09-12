import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { GitHubConnectionMethod } from "./github-connection-enums";

export const GitHubConnectionOAuthInputCredentialsSchema = z.union([
  z.object({
    code: z.string().trim().min(1, "OAuth code required"),
    instanceType: z.literal("server"),
    host: z.string().trim().min(1, "Host is required for server instance type")
  }),
  z.object({
    code: z.string().trim().min(1, "OAuth code required"),
    instanceType: z.literal("cloud").optional(),
    host: z.string().trim().optional()
  })
]);

export const GitHubConnectionAppInputCredentialsSchema = z.union([
  z.object({
    code: z.string().trim().min(1, "GitHub App code required"),
    installationId: z.string().min(1, "GitHub App Installation ID required"),
    instanceType: z.literal("server"),
    host: z.string().trim().min(1, "Host is required for server instance type")
  }),
  z.object({
    code: z.string().trim().min(1, "GitHub App code required"),
    installationId: z.string().min(1, "GitHub App Installation ID required"),
    instanceType: z.literal("cloud").optional(),
    host: z.string().trim().optional()
  })
]);

export const GitHubConnectionOAuthOutputCredentialsSchema = z.union([
  z.object({
    accessToken: z.string(),
    instanceType: z.literal("server"),
    host: z.string().trim().min(1)
  }),
  z.object({
    accessToken: z.string(),
    instanceType: z.literal("cloud").optional(),
    host: z.string().trim().optional()
  })
]);

export const GitHubConnectionAppOutputCredentialsSchema = z.union([
  z.object({
    installationId: z.string(),
    instanceType: z.literal("server"),
    host: z.string().trim().min(1)
  }),
  z.object({
    installationId: z.string(),
    instanceType: z.literal("cloud").optional(),
    host: z.string().trim().optional()
  })
]);

export const ValidateGitHubConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(GitHubConnectionMethod.App).describe(AppConnections.CREATE(AppConnection.GitHub).method),
    credentials: GitHubConnectionAppInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GitHub).credentials
    )
  }),
  z.object({
    method: z.literal(GitHubConnectionMethod.OAuth).describe(AppConnections.CREATE(AppConnection.GitHub).method),
    credentials: GitHubConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GitHub).credentials
    )
  })
]);

export const CreateGitHubConnectionSchema = ValidateGitHubConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GitHub, {
    supportsGateways: true
  })
);

export const UpdateGitHubConnectionSchema = z
  .object({
    credentials: z
      .union([GitHubConnectionAppInputCredentialsSchema, GitHubConnectionOAuthInputCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.GitHub).credentials)
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.GitHub, {
      supportsGateways: true
    })
  );

const BaseGitHubConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.GitHub) });

export const GitHubConnectionSchema = z.intersection(
  BaseGitHubConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(GitHubConnectionMethod.App),
      credentials: GitHubConnectionAppOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(GitHubConnectionMethod.OAuth),
      credentials: GitHubConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedGitHubConnectionSchema = z.discriminatedUnion("method", [
  BaseGitHubConnectionSchema.extend({
    method: z.literal(GitHubConnectionMethod.App),
    credentials: z.object({
      instanceType: z.union([z.literal("server"), z.literal("cloud")]).optional(),
      host: z.string().optional()
    })
  }),
  BaseGitHubConnectionSchema.extend({
    method: z.literal(GitHubConnectionMethod.OAuth),
    credentials: z.object({
      instanceType: z.union([z.literal("server"), z.literal("cloud")]).optional(),
      host: z.string().optional()
    })
  })
]);

export const GitHubConnectionListItemSchema = z.object({
  name: z.literal("GitHub"),
  app: z.literal(AppConnection.GitHub),
  // the below is preferable but currently breaks with our zod to json schema parser
  // methods: z.tuple([z.literal(GitHubConnectionMethod.App), z.literal(GitHubConnectionMethod.OAuth)]),
  methods: z.nativeEnum(GitHubConnectionMethod).array(),
  oauthClientId: z.string().optional(),
  appClientSlug: z.string().optional()
});
