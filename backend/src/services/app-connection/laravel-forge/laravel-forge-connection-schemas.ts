import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { LaravelForgeConnectionMethod } from "./laravel-forge-connection-enums";

export const LaravelForgeConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API token required").describe(AppConnections.CREDENTIALS.LARAVEL_FORGE.apiToken)
});

const BaseLaravelForgeConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.LaravelForge) });

export const LaravelForgeConnectionSchema = BaseLaravelForgeConnectionSchema.extend({
  method: z.literal(LaravelForgeConnectionMethod.ApiToken),
  credentials: LaravelForgeConnectionApiTokenCredentialsSchema
});

export const SanitizedLaravelForgeConnectionSchema = z.discriminatedUnion("method", [
  BaseLaravelForgeConnectionSchema.extend({
    method: z.literal(LaravelForgeConnectionMethod.ApiToken),
    credentials: LaravelForgeConnectionApiTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.LaravelForge]} (API Token)` }))
]);

export const ValidateLaravelForgeConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(LaravelForgeConnectionMethod.ApiToken)
      .describe(AppConnections.CREATE(AppConnection.LaravelForge).method),
    credentials: LaravelForgeConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.LaravelForge).credentials
    )
  })
]);

export const CreateLaravelForgeConnectionSchema = ValidateLaravelForgeConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.LaravelForge)
);

export const UpdateLaravelForgeConnectionSchema = z
  .object({
    credentials: LaravelForgeConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.LaravelForge).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.LaravelForge));

export const LaravelForgeConnectionListItemSchema = z
  .object({
    name: z.literal("Laravel Forge"),
    app: z.literal(AppConnection.LaravelForge),
    methods: z.nativeEnum(LaravelForgeConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.LaravelForge] }));
