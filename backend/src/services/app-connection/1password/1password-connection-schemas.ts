import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { OnePassConnectionMethod } from "./1password-connection-enums";

export const OnePassConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.ONEPASS.apiToken),
  instanceUrl: z
    .string()
    .trim()
    .url("Invalid Connect Server instance URL")
    .min(1, "Instance URL required")
    .describe(AppConnections.CREDENTIALS.ONEPASS.instanceUrl)
});

const BaseOnePassConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OnePass) });

export const OnePassConnectionSchema = BaseOnePassConnectionSchema.extend({
  method: z.literal(OnePassConnectionMethod.ApiToken),
  credentials: OnePassConnectionAccessTokenCredentialsSchema
});

export const SanitizedOnePassConnectionSchema = z.discriminatedUnion("method", [
  BaseOnePassConnectionSchema.extend({
    method: z.literal(OnePassConnectionMethod.ApiToken),
    credentials: OnePassConnectionAccessTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.OnePass]} (API Token)` }))
]);

export const ValidateOnePassConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(OnePassConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.OnePass).method),
    credentials: OnePassConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.OnePass).credentials
    )
  })
]);

export const CreateOnePassConnectionSchema = ValidateOnePassConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OnePass)
);

export const UpdateOnePassConnectionSchema = z
  .object({
    credentials: OnePassConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OnePass).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OnePass));

export const OnePassConnectionListItemSchema = z
  .object({
    name: z.literal("1Password"),
    app: z.literal(AppConnection.OnePass),
    methods: z.nativeEnum(OnePassConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.OnePass] }));
