import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DatadogConnectionMethod } from "./datadog-connection-enums";

export const DatadogConnectionApiKeyCredentialsSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Invalid Datadog URL")
    .min(1, "URL required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.DATADOG.url),
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.DATADOG.apiKey),
  applicationKey: z
    .string()
    .trim()
    .min(1, "Application Key required")
    .describe(AppConnections.CREDENTIALS.DATADOG.applicationKey)
});

const BaseDatadogConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Datadog)
});

export const DatadogConnectionSchema = z.discriminatedUnion("method", [
  BaseDatadogConnectionSchema.extend({
    method: z.literal(DatadogConnectionMethod.ApiKey),
    credentials: DatadogConnectionApiKeyCredentialsSchema
  })
]);

export const SanitizedDatadogConnectionSchema = z.discriminatedUnion("method", [
  BaseDatadogConnectionSchema.extend({
    method: z.literal(DatadogConnectionMethod.ApiKey),
    credentials: DatadogConnectionApiKeyCredentialsSchema.pick({ url: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Datadog]} (API Key)` }))
]);

export const ValidateDatadogConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(DatadogConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Datadog).method),
    credentials: DatadogConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Datadog).credentials
    )
  })
]);

export const CreateDatadogConnectionSchema = ValidateDatadogConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Datadog)
);

export const UpdateDatadogConnectionSchema = z
  .object({
    credentials: DatadogConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Datadog).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Datadog));

export const DatadogConnectionListItemSchema = z
  .object({
    name: z.literal("Datadog"),
    app: z.literal(AppConnection.Datadog),
    methods: z.nativeEnum(DatadogConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Datadog] }));
