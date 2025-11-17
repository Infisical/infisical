import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { SupabaseConnectionMethod } from "./supabase-connection-constants";

export const SupabaseConnectionMethodSchema = z
  .nativeEnum(SupabaseConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.Supabase).method);

export const SupabaseConnectionAccessTokenCredentialsSchema = z.object({
  accessKey: z
    .string()
    .trim()
    .min(1, "Access Key required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.SUPABASE.accessKey),
  instanceUrl: z.string().trim().url().max(255).describe(AppConnections.CREDENTIALS.SUPABASE.instanceUrl).optional()
});

const BaseSupabaseConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Supabase)
});

export const SupabaseConnectionSchema = BaseSupabaseConnectionSchema.extend({
  method: SupabaseConnectionMethodSchema,
  credentials: SupabaseConnectionAccessTokenCredentialsSchema
});

export const SanitizedSupabaseConnectionSchema = z.discriminatedUnion("method", [
  BaseSupabaseConnectionSchema.extend({
    method: SupabaseConnectionMethodSchema,
    credentials: SupabaseConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Supabase]} (Access Token)` }))
]);

export const ValidateSupabaseConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: SupabaseConnectionMethodSchema,
    credentials: SupabaseConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Supabase).credentials
    )
  })
]);

export const CreateSupabaseConnectionSchema = ValidateSupabaseConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Supabase)
);

export const UpdateSupabaseConnectionSchema = z
  .object({
    credentials: SupabaseConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Supabase).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Supabase));

export const SupabaseConnectionListItemSchema = z
  .object({
    name: z.literal("Supabase"),
    app: z.literal(AppConnection.Supabase),
    methods: z.nativeEnum(SupabaseConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Supabase] }));
