import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { RundeckConnectionMethod } from "./rundeck-connection-enums";

export const RundeckConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Instance URL")
    .min(1, "Instance URL required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.RUNDECK.instanceUrl),
  apiToken: z.string().trim().min(1, "API token required").describe(AppConnections.CREDENTIALS.RUNDECK.apiToken)
});

const BaseRundeckConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Rundeck)
});

export const RundeckConnectionSchema = z.discriminatedUnion("method", [
  BaseRundeckConnectionSchema.extend({
    method: z.literal(RundeckConnectionMethod.ApiToken),
    credentials: RundeckConnectionApiTokenCredentialsSchema
  })
]);

export const SanitizedRundeckConnectionSchema = z.discriminatedUnion("method", [
  BaseRundeckConnectionSchema.extend({
    method: z.literal(RundeckConnectionMethod.ApiToken),
    credentials: RundeckConnectionApiTokenCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Rundeck]} (API Token)` }))
]);

export const ValidateRundeckConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(RundeckConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Rundeck).method),
    credentials: RundeckConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Rundeck).credentials
    )
  })
]);

export const CreateRundeckConnectionSchema = ValidateRundeckConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Rundeck)
);

export const UpdateRundeckConnectionSchema = z
  .object({
    credentials: RundeckConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Rundeck).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Rundeck));

export const RundeckConnectionListItemSchema = z
  .object({
    name: z.literal("Rundeck"),
    app: z.literal(AppConnection.Rundeck),
    methods: z.nativeEnum(RundeckConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Rundeck] }));
