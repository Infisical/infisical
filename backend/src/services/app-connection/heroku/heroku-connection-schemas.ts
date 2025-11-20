import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { HerokuConnectionMethod } from "./heroku-connection-enums";

export const HerokuConnectionAuthTokenCredentialsSchema = z.object({
  authToken: z.string().trim().min(1, "Auth Token required").startsWith("HRKU-", "Token must start with 'HRKU-")
});

export const HerokuConnectionOAuthCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required")
});

export const HerokuConnectionOAuthOutputCredentialsSchema = z.object({
  authToken: z.string().trim(),
  refreshToken: z.string().trim(),
  expiresAt: z.date()
});

// Schema for refresh token input during initial setup
export const HerokuConnectionRefreshTokenCredentialsSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token required")
});

const BaseHerokuConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Heroku)
});

export const HerokuConnectionSchema = z.intersection(
  BaseHerokuConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(HerokuConnectionMethod.AuthToken),
      credentials: HerokuConnectionAuthTokenCredentialsSchema
    }),
    z.object({
      method: z.literal(HerokuConnectionMethod.OAuth),
      credentials: HerokuConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedHerokuConnectionSchema = z.discriminatedUnion("method", [
  BaseHerokuConnectionSchema.extend({
    method: z.literal(HerokuConnectionMethod.AuthToken),
    credentials: HerokuConnectionAuthTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Heroku]} (Auth Token)` })),
  BaseHerokuConnectionSchema.extend({
    method: z.literal(HerokuConnectionMethod.OAuth),
    credentials: HerokuConnectionOAuthOutputCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Heroku]} (OAuth)` }))
]);

export const ValidateHerokuConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(HerokuConnectionMethod.AuthToken).describe(AppConnections.CREATE(AppConnection.Heroku).method),
    credentials: HerokuConnectionAuthTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Heroku).credentials
    )
  }),
  z.object({
    method: z.literal(HerokuConnectionMethod.OAuth).describe(AppConnections.CREATE(AppConnection.Heroku).method),
    credentials: z
      .union([
        HerokuConnectionOAuthCredentialsSchema,
        HerokuConnectionRefreshTokenCredentialsSchema,
        HerokuConnectionOAuthOutputCredentialsSchema
      ])
      .describe(AppConnections.CREATE(AppConnection.Heroku).credentials)
  })
]);

export const CreateHerokuConnectionSchema = ValidateHerokuConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Heroku)
);

export const UpdateHerokuConnectionSchema = z
  .object({
    credentials: z
      .union([
        HerokuConnectionAuthTokenCredentialsSchema,
        HerokuConnectionOAuthOutputCredentialsSchema,
        HerokuConnectionRefreshTokenCredentialsSchema,
        HerokuConnectionOAuthCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.Heroku).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Heroku));

export const HerokuConnectionListItemSchema = z
  .object({
    name: z.literal("Heroku"),
    app: z.literal(AppConnection.Heroku),
    methods: z.nativeEnum(HerokuConnectionMethod).array(),
    oauthClientId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Heroku] }));
