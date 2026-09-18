import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OpenAIConnectionMethod } from "./openai-connection-enums";

export const OpenAIConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.OPENAI.apiKey)
});

const BaseOpenAIConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OpenAI) });

export const OpenAIConnectionSchema = BaseOpenAIConnectionSchema.extend({
  method: z.literal(OpenAIConnectionMethod.ApiKey),
  credentials: OpenAIConnectionApiKeyCredentialsSchema
});

export const SanitizedOpenAIConnectionSchema = z.discriminatedUnion("method", [
  BaseOpenAIConnectionSchema.extend({
    method: z.literal(OpenAIConnectionMethod.ApiKey),
    credentials: z.object({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OpenAI]} (API Key)` }))
]);

export const ValidateOpenAIConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(OpenAIConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.OpenAI).method),
    credentials: OpenAIConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OpenAI).credentials
    )
  })
]);

export const CreateOpenAIConnectionSchema = ValidateOpenAIConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OpenAI)
);

export const UpdateOpenAIConnectionSchema = z
  .object({
    credentials: OpenAIConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OpenAI).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OpenAI));

export const OpenAIConnectionListItemSchema = z
  .object({
    name: z.literal("OpenAI"),
    app: z.literal(AppConnection.OpenAI),
    methods: z.nativeEnum(OpenAIConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OpenAI] }));
