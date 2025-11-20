import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ChecklyConnectionMethod } from "./checkly-connection-constants";

export const ChecklyConnectionMethodSchema = z
  .nativeEnum(ChecklyConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.Checkly).method);

export const ChecklyConnectionAccessTokenCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").max(255).describe(AppConnections.CREDENTIALS.CHECKLY.apiKey)
});

const BaseChecklyConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Checkly)
});

export const ChecklyConnectionSchema = BaseChecklyConnectionSchema.extend({
  method: ChecklyConnectionMethodSchema,
  credentials: ChecklyConnectionAccessTokenCredentialsSchema
});

export const SanitizedChecklyConnectionSchema = z.discriminatedUnion("method", [
  BaseChecklyConnectionSchema.extend({
    method: ChecklyConnectionMethodSchema,
    credentials: ChecklyConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Checkly]} (Access Token)` }))
]);

export const ValidateChecklyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: ChecklyConnectionMethodSchema,
    credentials: ChecklyConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Checkly).credentials
    )
  })
]);

export const CreateChecklyConnectionSchema = ValidateChecklyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Checkly)
);

export const UpdateChecklyConnectionSchema = z
  .object({
    credentials: ChecklyConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Checkly).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Checkly));

export const ChecklyConnectionListItemSchema = z
  .object({
    name: z.literal("Checkly"),
    app: z.literal(AppConnection.Checkly),
    methods: z.nativeEnum(ChecklyConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Checkly] }));
