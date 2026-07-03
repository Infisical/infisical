import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";

import { AppConnection } from "../app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "../app-connection-schemas";
import { GiteaConnectionMethod } from "./gitea-connection-enums";

export const GiteaConnectionPersonalAccessTokenCredentialsSchema = z.object({
  personalAccessToken: z
    .string()
    .trim()
    .min(1, "Personal Access Token required")
    .describe(AppConnections.CREDENTIALS.GITEA.personalAccessToken),
  instanceUrl: z.string().trim().url("Invalid Instance URL").describe(AppConnections.CREDENTIALS.GITEA.instanceUrl)
});

export const GiteaConnectionOAuthCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required").describe(AppConnections.CREDENTIALS.GITEA.code),
  instanceUrl: z.string().trim().url("Invalid Instance URL").describe(AppConnections.CREDENTIALS.GITEA.instanceUrl)
});

export const GiteaConnectionOAuthOutputCredentialsSchema = z.object({
  accessToken: z.string().trim(),
  refreshToken: z.string().trim(),
  expiresAt: z.date(),
  tokenType: z.string().optional().default("bearer"),
  instanceUrl: z.string().trim().url("Invalid Instance URL").describe(AppConnections.CREDENTIALS.GITEA.instanceUrl)
});

const BaseGiteaConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Gitea)
});

export const GiteaConnectionSchema = z.intersection(
  BaseGiteaConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(GiteaConnectionMethod.PersonalAccessToken),
      credentials: GiteaConnectionPersonalAccessTokenCredentialsSchema
    }),
    z.object({
      method: z.literal(GiteaConnectionMethod.OAuth),
      credentials: GiteaConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedGiteaConnectionSchema = z.discriminatedUnion("method", [
  BaseGiteaConnectionSchema.extend({
    method: z.literal(GiteaConnectionMethod.PersonalAccessToken),
    credentials: GiteaConnectionPersonalAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Gitea]} (Personal Access Token)` })),
  BaseGiteaConnectionSchema.extend({
    method: z.literal(GiteaConnectionMethod.OAuth),
    credentials: GiteaConnectionOAuthOutputCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Gitea]} (OAuth)` }))
]);

export const ValidateGiteaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(GiteaConnectionMethod.PersonalAccessToken)
      .describe(AppConnections.CREATE(AppConnection.Gitea).method),
    credentials: GiteaConnectionPersonalAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Gitea).credentials
    )
  }),
  z.object({
    method: z.literal(GiteaConnectionMethod.OAuth).describe(AppConnections.CREATE(AppConnection.Gitea).method),
    credentials: z
      .union([GiteaConnectionOAuthCredentialsSchema, GiteaConnectionOAuthOutputCredentialsSchema])
      .describe(AppConnections.CREATE(AppConnection.Gitea).credentials)
  })
]);

export const CreateGiteaConnectionSchema = ValidateGiteaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Gitea)
);

export const UpdateGiteaConnectionSchema = z
  .object({
    credentials: z
      .union([
        GiteaConnectionPersonalAccessTokenCredentialsSchema,
        GiteaConnectionOAuthCredentialsSchema,
        GiteaConnectionOAuthOutputCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.Gitea).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Gitea));

export const GiteaConnectionListItemSchema = z
  .object({
    name: z.literal("Gitea"),
    app: z.literal(AppConnection.Gitea),
    methods: z.nativeEnum(GiteaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Gitea] }));
