import * as z from "zod";

import { AppConnections } from "@app/lib/api-docs";

import { AppConnection } from "../app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "../app-connection-schemas";
import { CoolifyConnectionMethod } from "./coolify-connection-enums";

export const CoolifyConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.COOLIFY.apiToken),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Coolify instance URL")
    .min(1, "Instance URL required")
    .describe(AppConnections.CREDENTIALS.COOLIFY.instanceUrl)
});

export const BaseCoolifyConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Coolify)
});

export const CoolifyConnectionSchema = BaseCoolifyConnectionSchema.extend({
  method: z.literal(CoolifyConnectionMethod.ApiToken),
  credentials: CoolifyConnectionAccessTokenCredentialsSchema
});

export const SanitizedCoolifyConnectionSchema = z.discriminatedUnion("method", [
  BaseCoolifyConnectionSchema.extend({
    method: z.literal(CoolifyConnectionMethod.ApiToken),
    credentials: CoolifyConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  })
]);

export const ValidateCoolifyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(CoolifyConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Coolify).method),
    credentials: CoolifyConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Coolify).credentials
    )
  })
]);

export const CreateCoolifyConnectionSchema = ValidateCoolifyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Coolify)
);

export const UpdateCoolifyConnectionSchema = z
  .object({
    credentials: CoolifyConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Coolify).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Coolify));

export const CoolifyConnectionListItemSchema = z.object({
  name: z.literal("Coolify"),
  app: z.literal(AppConnection.Coolify),
  methods: z.nativeEnum(CoolifyConnectionMethod).array()
});
