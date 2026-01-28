import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OpenRouterConnectionMethod } from "./open-router-connection-enums";

export const OpenRouterConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.OPEN_ROUTER.apiKey)
});

const BaseOpenRouterConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OpenRouter) });

export const OpenRouterConnectionSchema = BaseOpenRouterConnectionSchema.extend({
  method: z.literal(OpenRouterConnectionMethod.ApiKey),
  credentials: OpenRouterConnectionApiKeyCredentialsSchema
});

export const SanitizedOpenRouterConnectionSchema = z.discriminatedUnion("method", [
  BaseOpenRouterConnectionSchema.extend({
    method: z.literal(OpenRouterConnectionMethod.ApiKey),
    credentials: z.object({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OpenRouter]} (API Key)` }))
]);

export const ValidateOpenRouterConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(OpenRouterConnectionMethod.ApiKey)
      .describe(AppConnections.CREATE(AppConnection.OpenRouter).method),
    credentials: OpenRouterConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OpenRouter).credentials
    )
  })
]);

export const CreateOpenRouterConnectionSchema = ValidateOpenRouterConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OpenRouter)
);

export const UpdateOpenRouterConnectionSchema = z
  .object({
    credentials: OpenRouterConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OpenRouter).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OpenRouter));

export const OpenRouterConnectionListItemSchema = z
  .object({
    name: z.literal("OpenRouter"),
    app: z.literal(AppConnection.OpenRouter),
    methods: z.nativeEnum(OpenRouterConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OpenRouter] }));
