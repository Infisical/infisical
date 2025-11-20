import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
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

export const GitHubConnectionPatInputCredentialsSchema = z.union([
  z.object({
    personalAccessToken: z.string().trim().min(1, "Personal Access Token required"),
    instanceType: z.literal("server"),
    host: z.string().trim().min(1, "Host is required for server instance type")
  }),
  z.object({
    personalAccessToken: z.string().trim().min(1, "Personal Access Token required"),
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

export const GitHubConnectionPatOutputCredentialsSchema = z.union([
  z.object({
    personalAccessToken: z.string(),
    instanceType: z.literal("server"),
    host: z.string().trim().min(1)
  }),
  z.object({
    personalAccessToken: z.string(),
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
  }),
  z.object({
    method: z.literal(GitHubConnectionMethod.Pat).describe(AppConnections.CREATE(AppConnection.GitHub).method),
    credentials: GitHubConnectionPatInputCredentialsSchema.describe(
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
      .union([
        GitHubConnectionAppInputCredentialsSchema,
        GitHubConnectionOAuthInputCredentialsSchema,
        GitHubConnectionPatInputCredentialsSchema
      ])
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
    }),
    z.object({
      method: z.literal(GitHubConnectionMethod.Pat),
      credentials: GitHubConnectionPatOutputCredentialsSchema
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
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GitHub]} (GitHub App)` })),
  BaseGitHubConnectionSchema.extend({
    method: z.literal(GitHubConnectionMethod.OAuth),
    credentials: z.object({
      instanceType: z.union([z.literal("server"), z.literal("cloud")]).optional(),
      host: z.string().optional()
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GitHub]} (OAuth)` })),
  BaseGitHubConnectionSchema.extend({
    method: z.literal(GitHubConnectionMethod.Pat),
    credentials: z.object({
      instanceType: z.union([z.literal("server"), z.literal("cloud")]).optional(),
      host: z.string().optional()
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GitHub]} (Personal Access Token)` }))
]);

export const GitHubConnectionListItemSchema = z
  .object({
    name: z.literal("GitHub"),
    app: z.literal(AppConnection.GitHub),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(GitHubConnectionMethod.App), z.literal(GitHubConnectionMethod.OAuth)]),
    methods: z.nativeEnum(GitHubConnectionMethod).array(),
    oauthClientId: z.string().optional(),
    appClientSlug: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.GitHub] }));
