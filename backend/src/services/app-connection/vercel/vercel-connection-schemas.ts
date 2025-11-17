import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { VercelConnectionMethod } from "./vercel-connection-enums";

export const VercelConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.VERCEL.apiToken)
});

const BaseVercelConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Vercel)
});

export const VercelConnectionSchema = BaseVercelConnectionSchema.extend({
  method: z.literal(VercelConnectionMethod.ApiToken),
  credentials: VercelConnectionAccessTokenCredentialsSchema
});

export const SanitizedVercelConnectionSchema = z.discriminatedUnion("method", [
  BaseVercelConnectionSchema.extend({
    method: z.literal(VercelConnectionMethod.ApiToken),
    credentials: VercelConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Vercel]} (API Token)` }))
]);

export const ValidateVercelConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(VercelConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Vercel).method),
    credentials: VercelConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Vercel).credentials
    )
  })
]);

export const CreateVercelConnectionSchema = ValidateVercelConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Vercel)
);

export const UpdateVercelConnectionSchema = z
  .object({
    credentials: VercelConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Vercel).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Vercel));

export const VercelConnectionListItemSchema = z
  .object({
    name: z.literal("Vercel"),
    app: z.literal(AppConnection.Vercel),
    methods: z.nativeEnum(VercelConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Vercel] }));
