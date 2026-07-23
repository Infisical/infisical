import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { LiteLLMConnectionMethod } from "./litellm-connection-enums";

export const LiteLLMConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.LITELLM.apiKey),
  instanceUrl: z
    .string()
    .trim()
    .min(1, "Instance URL required")
    .url("Invalid Instance URL")
    .describe(AppConnections.CREDENTIALS.LITELLM.instanceUrl)
});

const BaseLiteLLMConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.LiteLLM) });

export const LiteLLMConnectionSchema = BaseLiteLLMConnectionSchema.extend({
  method: z.literal(LiteLLMConnectionMethod.ApiKey),
  credentials: LiteLLMConnectionApiKeyCredentialsSchema
});

export const SanitizedLiteLLMConnectionSchema = z.discriminatedUnion("method", [
  BaseLiteLLMConnectionSchema.extend({
    method: z.literal(LiteLLMConnectionMethod.ApiKey),
    credentials: LiteLLMConnectionApiKeyCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.LiteLLM]} (API Key)` }))
]);

export const ValidateLiteLLMConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(LiteLLMConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.LiteLLM).method),
    credentials: LiteLLMConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.LiteLLM).credentials
    )
  })
]);

export const CreateLiteLLMConnectionSchema = ValidateLiteLLMConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.LiteLLM)
);

export const UpdateLiteLLMConnectionSchema = z
  .object({
    credentials: LiteLLMConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.LiteLLM).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.LiteLLM));

export const LiteLLMConnectionListItemSchema = z
  .object({
    name: z.literal("LiteLLM"),
    app: z.literal(AppConnection.LiteLLM),
    methods: z.nativeEnum(LiteLLMConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.LiteLLM] }));
