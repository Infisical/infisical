import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { KeeperConnectionMethod } from "./keeper-connection-enums";

export const KeeperConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "API Key required")
    .max(500, "API Key cannot exceed 500 characters")
    .describe(AppConnections.CREDENTIALS.KEEPER.apiKey),
  instanceUrl: z
    .string()
    .trim()
    .min(1, "Instance URL required")
    .max(255, "Instance URL cannot exceed 255 characters")
    .url("Invalid Instance URL")
    .describe(AppConnections.CREDENTIALS.KEEPER.instanceUrl)
});

const BaseKeeperConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Keeper) });

export const KeeperConnectionSchema = BaseKeeperConnectionSchema.extend({
  method: z.literal(KeeperConnectionMethod.ApiKey),
  credentials: KeeperConnectionApiKeyCredentialsSchema
});

export const SanitizedKeeperConnectionSchema = z.discriminatedUnion("method", [
  BaseKeeperConnectionSchema.extend({
    method: z.literal(KeeperConnectionMethod.ApiKey),
    credentials: KeeperConnectionApiKeyCredentialsSchema.pick({ instanceUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Keeper]} (API Key)` }))
]);

export const ValidateKeeperConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(KeeperConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Keeper).method),
    credentials: KeeperConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Keeper).credentials
    )
  })
]);

export const CreateKeeperConnectionSchema = ValidateKeeperConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Keeper)
);

export const UpdateKeeperConnectionSchema = z
  .object({
    credentials: KeeperConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Keeper).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Keeper));

export const KeeperConnectionListItemSchema = z
  .object({
    name: z.literal("Keeper"),
    app: z.literal(AppConnection.Keeper),
    methods: z.nativeEnum(KeeperConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Keeper] }));
