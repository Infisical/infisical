import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AnthropicConnectionMethod } from "./anthropic-connection-enums";

export const AnthropicConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.ANTHROPIC.apiKey)
});

const BaseAnthropicConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Anthropic) });

export const AnthropicConnectionSchema = BaseAnthropicConnectionSchema.extend({
  method: z.literal(AnthropicConnectionMethod.ApiKey),
  credentials: AnthropicConnectionApiKeyCredentialsSchema
});

export const SanitizedAnthropicConnectionSchema = z.discriminatedUnion("method", [
  BaseAnthropicConnectionSchema.extend({
    method: z.literal(AnthropicConnectionMethod.ApiKey),
    credentials: z.object({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Anthropic]} (API Key)` }))
]);

export const ValidateAnthropicConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(AnthropicConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Anthropic).method),
    credentials: AnthropicConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Anthropic).credentials
    )
  })
]);

export const CreateAnthropicConnectionSchema = ValidateAnthropicConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Anthropic)
);

export const UpdateAnthropicConnectionSchema = z
  .object({
    credentials: AnthropicConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Anthropic).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Anthropic));

export const AnthropicConnectionListItemSchema = z
  .object({
    name: z.literal("Anthropic"),
    app: z.literal(AppConnection.Anthropic),
    methods: z.nativeEnum(AnthropicConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Anthropic] }));
