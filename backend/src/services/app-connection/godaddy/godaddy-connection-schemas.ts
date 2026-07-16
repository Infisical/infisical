import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { GoDaddyConnectionMethod } from "./godaddy-connection-enums";

export const GoDaddyConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.GODADDY.apiKey),
  apiSecret: z.string().trim().min(1, "API Secret required").describe(AppConnections.CREDENTIALS.GODADDY.apiSecret)
});

const BaseGoDaddyConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.GoDaddy)
});

export const GoDaddyConnectionSchema = BaseGoDaddyConnectionSchema.extend({
  method: z.literal(GoDaddyConnectionMethod.ApiKey),
  credentials: GoDaddyConnectionApiKeyCredentialsSchema
});

export const SanitizedGoDaddyConnectionSchema = z.discriminatedUnion("method", [
  BaseGoDaddyConnectionSchema.extend({
    method: z.literal(GoDaddyConnectionMethod.ApiKey),
    credentials: z.object({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.GoDaddy]} (API Key)` }))
]);

export const ValidateGoDaddyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(GoDaddyConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.GoDaddy).method),
    credentials: GoDaddyConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.GoDaddy).credentials
    )
  })
]);

export const CreateGoDaddyConnectionSchema = ValidateGoDaddyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.GoDaddy)
);

export const UpdateGoDaddyConnectionSchema = z
  .object({
    credentials: GoDaddyConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.GoDaddy).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.GoDaddy));

export const GoDaddyConnectionListItemSchema = z
  .object({
    name: z.literal("GoDaddy"),
    app: z.literal(AppConnection.GoDaddy),
    methods: z.nativeEnum(GoDaddyConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.GoDaddy] }));
