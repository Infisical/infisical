import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SpaceliftConnectionMethod } from "./spacelift-connection-enums";

export const SpaceliftConnectionApiKeyCredentialsSchema = z.object({
  apiUrl: z
    .string()
    .trim()
    .url("API URL must be a valid URL")
    .min(1, "API URL required")
    .max(256, "API URL cannot exceed 256 characters"),
  apiKeyId: z.string().trim().min(1, "API Key ID required").max(256, "API Key ID cannot exceed 256 characters"),
  apiKeySecret: z
    .string()
    .trim()
    .min(1, "API Key Secret required")
    .max(256, "API Key Secret cannot exceed 256 characters")
});

const BaseSpaceliftConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Spacelift)
});

export const SpaceliftConnectionSchema = BaseSpaceliftConnectionSchema.extend({
  method: z.literal(SpaceliftConnectionMethod.ApiKeySecret),
  credentials: SpaceliftConnectionApiKeyCredentialsSchema
});

export const SanitizedSpaceliftConnectionSchema = z.discriminatedUnion("method", [
  BaseSpaceliftConnectionSchema.extend({
    method: z.literal(SpaceliftConnectionMethod.ApiKeySecret),
    credentials: SpaceliftConnectionApiKeyCredentialsSchema.pick({ apiUrl: true, apiKeyId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Spacelift]} (API Key)` }))
]);

export const ValidateSpaceliftConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(SpaceliftConnectionMethod.ApiKeySecret)
      .describe(AppConnections.CREATE(AppConnection.Spacelift).method),
    credentials: SpaceliftConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Spacelift).credentials
    )
  })
]);

export const CreateSpaceliftConnectionSchema = ValidateSpaceliftConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Spacelift)
);

export const UpdateSpaceliftConnectionSchema = z
  .object({
    credentials: SpaceliftConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Spacelift).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Spacelift));

export const SpaceliftConnectionListItemSchema = z
  .object({
    name: z.literal("Spacelift"),
    app: z.literal(AppConnection.Spacelift),
    methods: z.nativeEnum(SpaceliftConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Spacelift] }));
