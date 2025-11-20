import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GitHubRadarConnectionMethod } from "./github-radar-connection-enums";

export const GitHubRadarConnectionInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "GitHub Radar App code required"),
  installationId: z.string().min(1, "GitHub Radar App Installation ID required")
});

export const GitHubRadarConnectionOutputCredentialsSchema = z.object({
  installationId: z.string()
});

export const ValidateGitHubRadarConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(GitHubRadarConnectionMethod.App)
      .describe(AppConnections.CREATE(AppConnection.GitHubRadar).method),
    credentials: GitHubRadarConnectionInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GitHubRadar).credentials
    )
  })
]);

export const CreateGitHubRadarConnectionSchema = ValidateGitHubRadarConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GitHubRadar)
);

export const UpdateGitHubRadarConnectionSchema = z
  .object({
    credentials: GitHubRadarConnectionInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.GitHubRadar).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.GitHubRadar));

const BaseGitHubRadarConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.GitHubRadar) });

export const GitHubRadarConnectionSchema = BaseGitHubRadarConnectionSchema.extend({
  method: z.literal(GitHubRadarConnectionMethod.App),
  credentials: GitHubRadarConnectionOutputCredentialsSchema
});

export const SanitizedGitHubRadarConnectionSchema = z.discriminatedUnion("method", [
  BaseGitHubRadarConnectionSchema.extend({
    method: z.literal(GitHubRadarConnectionMethod.App),
    credentials: GitHubRadarConnectionOutputCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GitHubRadar]} (GitHub App)` }))
]);

export const GitHubRadarConnectionListItemSchema = z
  .object({
    name: z.literal("GitHub Radar"),
    app: z.literal(AppConnection.GitHubRadar),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(GitHubConnectionMethod.App), z.literal(GitHubConnectionMethod.OAuth)]),
    methods: z.nativeEnum(GitHubRadarConnectionMethod).array(),
    appClientSlug: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.GitHubRadar] }));
