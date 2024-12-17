import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/lib/app-connections";
import { slugSchema } from "@app/server/lib/schemas";
import { BaseAppConnectionSchema } from "@app/services/app-connection/app-connection-schemas";

import { GitHubConnectionMethod } from "./github-connection-enums";

export const GitHubConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().min(1, "OAuth code required")
});

export const GitHubConnectionAppInputCredentialsSchema = z.object({
  code: z.string().min(1, "GitHub App code required"),
  installationId: z.string().min(1, "GitHub App Installation ID required")
});

export const GitHubConnectionOAuthOutputCredentialsSchema = z.object({
  accessToken: z.string()
});

export const GitHubConnectionAppOutputCredentialsSchema = z.object({
  installationId: z.string()
});

export const CreateGitHubConnectionSchema = z
  .discriminatedUnion("method", [
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
  ])
  .and(z.object({ name: slugSchema({ field: "name" }).describe(AppConnections.CREATE(AppConnection.GitHub).name) }));

export const UpdateGitHubConnectionSchema = z.object({
  name: slugSchema({ field: "name" }).optional().describe(AppConnections.UPDATE(AppConnection.GitHub).name),
  credentials: z
    .union([GitHubConnectionAppInputCredentialsSchema, GitHubConnectionOAuthInputCredentialsSchema])
    .optional()
    .describe(AppConnections.UPDATE(AppConnection.GitHub).credentials)
});

const BaseGitHubConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.GitHub) });

export const GitHubAppConnectionSchema = z.intersection(
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
    credentials: GitHubConnectionAppOutputCredentialsSchema.omit({ installationId: true })
  }),
  BaseGitHubConnectionSchema.extend({
    method: z.literal(GitHubConnectionMethod.OAuth),
    credentials: GitHubConnectionOAuthOutputCredentialsSchema.omit({ accessToken: true })
  })
]);
