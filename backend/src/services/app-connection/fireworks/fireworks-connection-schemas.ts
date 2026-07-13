import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { FireworksConnectionMethod } from "./fireworks-connection-enums";

export const FireworksConnectionApiKeyCredentialsSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1, "Account ID required")
    .regex(/^[a-zA-Z0-9_-]+$/, "Account ID contains invalid characters")
    .describe(AppConnections.CREDENTIALS.FIREWORKS.accountId),
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.FIREWORKS.apiKey)
});

const BaseFireworksConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Fireworks) });

export const FireworksConnectionSchema = BaseFireworksConnectionSchema.extend({
  method: z.literal(FireworksConnectionMethod.ApiKey),
  credentials: FireworksConnectionApiKeyCredentialsSchema
});

export const SanitizedFireworksConnectionSchema = z.discriminatedUnion("method", [
  BaseFireworksConnectionSchema.extend({
    method: z.literal(FireworksConnectionMethod.ApiKey),
    credentials: FireworksConnectionApiKeyCredentialsSchema.pick({ accountId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Fireworks]} (API Key)` }))
]);

export const ValidateFireworksConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(FireworksConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Fireworks).method),
    credentials: FireworksConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Fireworks).credentials
    )
  })
]);

export const CreateFireworksConnectionSchema = ValidateFireworksConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Fireworks)
);

export const UpdateFireworksConnectionSchema = z
  .object({
    credentials: FireworksConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Fireworks).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Fireworks));

export const FireworksConnectionListItemSchema = z
  .object({
    name: z.literal("Fireworks"),
    app: z.literal(AppConnection.Fireworks),
    methods: z.nativeEnum(FireworksConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Fireworks] }));
