import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { ChefConnectionMethod } from "./chef-connection-enums";

export const ChefConnectionUserKeyCredentialsSchema = z.object({
  serverUrl: z
    .string()
    .trim()
    .url("Valid Chef Server URL required")
    .optional()
    .describe(AppConnections.CREDENTIALS.CHEF.serverUrl),
  orgName: z
    .string()
    .trim()
    .min(1, "Organization name required")
    .max(256, "Organization name cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.CHEF.orgName),
  userName: z
    .string()
    .trim()
    .min(1, "User name required")
    .max(256, "User name cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.CHEF.userName),
  privateKey: z
    .string()
    .trim()
    .min(1, "Private key required")
    .max(16384, "Private key cannot exceed 16384 characters")
    .describe(AppConnections.CREDENTIALS.CHEF.privateKey)
});

const BaseChefConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Chef) });

export const ChefConnectionSchema = BaseChefConnectionSchema.extend({
  method: z.literal(ChefConnectionMethod.UserKey),
  credentials: ChefConnectionUserKeyCredentialsSchema
});

export const SanitizedChefConnectionSchema = z.discriminatedUnion("method", [
  BaseChefConnectionSchema.extend({
    method: z.literal(ChefConnectionMethod.UserKey),
    credentials: ChefConnectionUserKeyCredentialsSchema.pick({ serverUrl: true, orgName: true, userName: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Chef]} (User Key)` }))
]);

export const ValidateChefConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(ChefConnectionMethod.UserKey).describe(AppConnections.CREATE(AppConnection.Chef).method),
    credentials: ChefConnectionUserKeyCredentialsSchema.describe(AppConnections.CREATE(AppConnection.Chef).credentials)
  })
]);

export const CreateChefConnectionSchema = ValidateChefConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Chef)
);

export const UpdateChefConnectionSchema = z
  .object({
    credentials: ChefConnectionUserKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Chef).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Chef));

export const ChefConnectionListItemSchema = z
  .object({
    name: z.literal("Chef"),
    app: z.literal(AppConnection.Chef),
    methods: z.nativeEnum(ChefConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Chef] }));
