import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { GitHubConnectionMethod } from "./github-connection-enums";

export const GitHubConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required")
});

export const GitHubConnectionAppInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "GitHub App code required"),
  installationId: z.string().min(1, "GitHub App Installation ID required")
});

export const GitHubConnectionOAuthOutputCredentialsSchema = z.object({
  accessToken: z.string()
});

export const GitHubConnectionAppOutputCredentialsSchema = z.object({
  installationId: z.string()
});

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
  GenericCreateAppConnectionFieldsSchema(AppConnection.GitHub)
);

export const UpdateGitHubConnectionSchema = z
  .object({
    credentials: z
      .union([GitHubConnectionAppInputCredentialsSchema, GitHubConnectionOAuthInputCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.GitHub).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.GitHub));

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
    credentials: GitHubConnectionAppOutputCredentialsSchema.pick({})
  }),
  BaseGitHubConnectionSchema.extend({
    method: z.literal(GitHubConnectionMethod.OAuth),
    credentials: GitHubConnectionOAuthOutputCredentialsSchema.pick({})
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
