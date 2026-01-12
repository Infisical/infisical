import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { TriggerDevConnectionMethod } from "./trigger-dev-connection-constants";

export const TriggerDevConnectionMethodSchema = z
  .nativeEnum(TriggerDevConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.TriggerDev).method);

export const TriggerDevConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API Token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.TRIGGER_DEV.apiToken),
  apiUrl: z
    .string()
    .trim()
    .url("Invalid API URL")
    .optional()
    .describe(AppConnections.CREDENTIALS.TRIGGER_DEV.apiUrl)
});

const BaseTriggerDevConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.TriggerDev)
});

export const TriggerDevConnectionSchema = BaseTriggerDevConnectionSchema.extend({
  method: TriggerDevConnectionMethodSchema,
  credentials: TriggerDevConnectionApiTokenCredentialsSchema
});

export const SanitizedTriggerDevConnectionSchema = z.discriminatedUnion("method", [
  BaseTriggerDevConnectionSchema.extend({
    method: TriggerDevConnectionMethodSchema,
    credentials: TriggerDevConnectionApiTokenCredentialsSchema.pick({
      apiUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.TriggerDev]} (API Token)` }))
]);

export const ValidateTriggerDevConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: TriggerDevConnectionMethodSchema,
    credentials: TriggerDevConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.TriggerDev).credentials
    )
  })
]);

export const CreateTriggerDevConnectionSchema = ValidateTriggerDevConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.TriggerDev)
);

export const UpdateTriggerDevConnectionSchema = z
  .object({
    credentials: TriggerDevConnectionApiTokenCredentialsSchema.optional().describe(
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
