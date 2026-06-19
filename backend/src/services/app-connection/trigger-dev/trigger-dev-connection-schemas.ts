import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { TriggerDevConnectionMethod } from "./trigger-dev-connection-enums";

export const TriggerDevConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").max(255).describe(AppConnections.CREDENTIALS.TRIGGER_DEV.apiKey),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid instance URL")
    .max(255)
    .optional()
    .describe(AppConnections.CREDENTIALS.TRIGGER_DEV.instanceUrl)
});

const BaseTriggerDevConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.TriggerDev) });

export const TriggerDevConnectionSchema = BaseTriggerDevConnectionSchema.extend({
  method: z.literal(TriggerDevConnectionMethod.ApiKey),
  credentials: TriggerDevConnectionApiKeyCredentialsSchema
});

export const SanitizedTriggerDevConnectionSchema = z.discriminatedUnion("method", [
  BaseTriggerDevConnectionSchema.extend({
    method: z.literal(TriggerDevConnectionMethod.ApiKey),
    // instanceUrl is not a secret, so it is safe to expose in the sanitized response
    credentials: TriggerDevConnectionApiKeyCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.TriggerDev]} (API Key)` }))
]);

export const ValidateTriggerDevConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(TriggerDevConnectionMethod.ApiKey)
      .describe(AppConnections.CREATE(AppConnection.TriggerDev).method),
    credentials: TriggerDevConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.TriggerDev).credentials
    )
  })
]);

export const CreateTriggerDevConnectionSchema = ValidateTriggerDevConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.TriggerDev)
);

export const UpdateTriggerDevConnectionSchema = z
  .object({
    credentials: TriggerDevConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.TriggerDev).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.TriggerDev));

export const TriggerDevConnectionListItemSchema = z
  .object({
    name: z.literal("Trigger.dev"),
    app: z.literal(AppConnection.TriggerDev),
    methods: z.nativeEnum(TriggerDevConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.TriggerDev] }));
