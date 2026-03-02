import RE2 from "re2";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AzureDnsConnectionMethod } from "./azure-dns-connection-enums";

const AZURE_GUID_REGEX = new RE2("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "i");

const azureGuidSchema = z
  .string()
  .trim()
  .refine((val) => AZURE_GUID_REGEX.test(val), { message: "Invalid GUID format" });
export const AzureDnsConnectionClientSecretCredentialsSchema = z.object({
  tenantId: azureGuidSchema.describe("Tenant ID must be a valid GUID"),
  clientId: azureGuidSchema.describe("Client ID must be a valid GUID"),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client secret required")
    .max(256, "Client secret cannot exceed 256 characters"),
  subscriptionId: azureGuidSchema.describe("Subscription ID must be a valid GUID")
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
