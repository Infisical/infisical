import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { RipplingConnectionMethod } from "./rippling-connection-enums";

export const RipplingConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API token required")
    .max(1024, "API token cannot exceed 1024 characters")
    .describe(AppConnections.CREDENTIALS.RIPPLING.apiToken)
});

const BaseRipplingConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Rippling) });

export const RipplingConnectionSchema = BaseRipplingConnectionSchema.extend({
  method: z.literal(RipplingConnectionMethod.ApiToken),
  credentials: RipplingConnectionApiTokenCredentialsSchema
});

export const SanitizedRipplingConnectionSchema = z.discriminatedUnion("method", [
  BaseRipplingConnectionSchema.extend({
    method: z.literal(RipplingConnectionMethod.ApiToken),
    credentials: RipplingConnectionApiTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Rippling]} (API Token)` }))
]);

export const ValidateRipplingConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(RipplingConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Rippling).method),
    credentials: RipplingConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Rippling).credentials
    )
  })
]);

export const CreateRipplingConnectionSchema = ValidateRipplingConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Rippling)
);

export const UpdateRipplingConnectionSchema = z
  .object({
    credentials: RipplingConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Rippling).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Rippling));

export const RipplingConnectionListItemSchema = z
  .object({
    name: z.literal("Rippling"),
    app: z.literal(AppConnection.Rippling),
    methods: z.nativeEnum(RipplingConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Rippling] }));
