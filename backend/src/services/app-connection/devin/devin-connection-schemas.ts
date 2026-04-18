import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DevinConnectionMethod } from "./devin-connection-enums";

export const DevinConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "API Key required")
    .max(1000)
    .startsWith("cog_", "API Key must start with 'cog_'")
    .describe(AppConnections.CREDENTIALS.DEVIN.apiKey)
});

const BaseDevinConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Devin) });

export const DevinConnectionSchema = BaseDevinConnectionSchema.extend({
  method: z.literal(DevinConnectionMethod.ApiKey),
  credentials: DevinConnectionApiKeyCredentialsSchema
});

export const SanitizedDevinConnectionSchema = z.discriminatedUnion("method", [
  BaseDevinConnectionSchema.extend({
    method: z.literal(DevinConnectionMethod.ApiKey),
    credentials: DevinConnectionApiKeyCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Devin]} (API Key)` }))
]);

export const ValidateDevinConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(DevinConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Devin).method),
    credentials: DevinConnectionApiKeyCredentialsSchema.describe(AppConnections.CREATE(AppConnection.Devin).credentials)
  })
]);

export const CreateDevinConnectionSchema = ValidateDevinConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Devin)
);

export const UpdateDevinConnectionSchema = z
  .object({
    credentials: DevinConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Devin).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Devin));

export const DevinConnectionListItemSchema = z
  .object({
    name: z.literal("Devin"),
    app: z.literal(AppConnection.Devin),
    methods: z.nativeEnum(DevinConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Devin] }));
