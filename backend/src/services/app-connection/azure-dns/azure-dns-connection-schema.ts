import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AzureDnsConnectionMethod } from "./azure-dns-connection-enum";

export const AzureDnsConnectionClientSecretCredentialsSchema = z.object({
  tenantId: z.string().trim().min(1, "Tenant ID required").max(256, "Tenant ID cannot exceed 256 characters"),
  clientId: z.string().trim().min(1, "Client ID required").max(256, "Client ID cannot exceed 256 characters"),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client secret required")
    .max(256, "Client secret cannot exceed 256 characters"),
  subscriptionId: z
    .string()
    .trim()
    .min(1, "Subscription ID required")
    .max(256, "Subscription ID cannot exceed 256 characters")
});

const BaseAzureDnsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureDNS)
});

export const AzureDnsConnectionSchema = BaseAzureDnsConnectionSchema.extend({
  method: z.literal(AzureDnsConnectionMethod.ClientSecret),
  credentials: AzureDnsConnectionClientSecretCredentialsSchema
});

export const SanitizedAzureDnsConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureDnsConnectionSchema.extend({
    method: z.literal(AzureDnsConnectionMethod.ClientSecret),
    credentials: AzureDnsConnectionClientSecretCredentialsSchema.pick({ tenantId: true, subscriptionId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDNS]} (Client Secret)` }))
]);

export const ValidateAzureDnsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureDnsConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureDNS).method),
    credentials: AzureDnsConnectionClientSecretCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDNS).credentials
    )
  })
]);

export const CreateAzureDnsConnectionSchema = ValidateAzureDnsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureDNS)
);

export const UpdateAzureDnsConnectionSchema = z
  .object({
    credentials: AzureDnsConnectionClientSecretCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.AzureDNS).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureDNS));

export const AzureDnsConnectionListItemSchema = z
  .object({
    name: z.literal("Azure DNS"),
    app: z.literal(AppConnection.AzureDNS),
    methods: z.nativeEnum(AzureDnsConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureDNS] }));
