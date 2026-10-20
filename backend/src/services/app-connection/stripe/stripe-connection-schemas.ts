import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { StripeConnectionMethod } from "./stripe-connection-enums";

export const StripeConnectionOAuthCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required").max(500)
});

// The refresh token is how each operation proves the app is still installed, and it is single-use,
// so every refresh rewrites it. Only the account ID is ever returned to clients.
export const StripeConnectionOAuthOutputCredentialsSchema = z.object({
  accountId: z.string().trim(),
  refreshToken: z.string()
});

const BaseStripeConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Stripe)
});

export const StripeConnectionSchema = z.intersection(
  BaseStripeConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(StripeConnectionMethod.OAuth),
      credentials: StripeConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedStripeConnectionSchema = z.discriminatedUnion("method", [
  BaseStripeConnectionSchema.extend({
    method: z.literal(StripeConnectionMethod.OAuth),
    credentials: StripeConnectionOAuthOutputCredentialsSchema.pick({ accountId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Stripe]} (OAuth)` }))
]);

export const ValidateStripeConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(StripeConnectionMethod.OAuth).describe(AppConnections.CREATE(AppConnection.Stripe).method),
    credentials: StripeConnectionOAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Stripe).credentials
    )
  })
]);

export const CreateStripeConnectionSchema = ValidateStripeConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Stripe)
);

export const UpdateStripeConnectionSchema = z
  .object({
    credentials: StripeConnectionOAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Stripe).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Stripe));

export const StripeConnectionListItemSchema = z
  .object({
    name: z.literal("Stripe"),
    app: z.literal(AppConnection.Stripe),
    methods: z.nativeEnum(StripeConnectionMethod).array(),
    oauthClientId: z.string().optional(),
    oauthAuthorizeUrl: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Stripe] }));
