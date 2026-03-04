import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DbtConnectionMethod } from "./dbt-connection-constants";

export const DbtConnectionMethodSchema = z
  .nativeEnum(DbtConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.Dbt).method);

export const DbtConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").max(255).describe(AppConnections.CREDENTIALS.DBT.apiToken),
  instanceUrl: z
    .string()
    .trim()
    .min(1, "Instance URL required")
    .url("Invalid Instance URL")
    .describe(AppConnections.CREDENTIALS.DBT.instanceUrl),
  accountId: z.string().trim().min(1, "Account ID required").max(255).describe(AppConnections.CREDENTIALS.DBT.accountId)
});

const BaseDbtConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Dbt)
});

export const DbtConnectionSchema = BaseDbtConnectionSchema.extend({
  method: DbtConnectionMethodSchema,
  credentials: DbtConnectionApiTokenCredentialsSchema
});

export const SanitizedDbtConnectionSchema = z.discriminatedUnion("method", [
  BaseDbtConnectionSchema.extend({
    method: DbtConnectionMethodSchema,
    credentials: DbtConnectionApiTokenCredentialsSchema.pick({ instanceUrl: true, accountId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Dbt]} (API Token)` }))
]);

export const ValidateDbtConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: DbtConnectionMethodSchema,
    credentials: DbtConnectionApiTokenCredentialsSchema.describe(AppConnections.CREATE(AppConnection.Dbt).credentials)
  })
]);

export const CreateDbtConnectionSchema = ValidateDbtConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Dbt)
);

export const UpdateDbtConnectionSchema = z
  .object({
    credentials: DbtConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Dbt).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Dbt));

export const DbtConnectionListItemSchema = z
  .object({
    name: z.literal("DBT"),
    app: z.literal(AppConnection.Dbt),
    methods: z.nativeEnum(DbtConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Dbt] }));
