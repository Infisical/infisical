import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AzureEntraIdConnectionMethod } from "./azure-entra-id-connection-enums";

export const AzureEntraIdConnectionClientSecretInputCredentialsSchema = z.object({
  clientId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Client ID required")
    .max(50, "Client ID must be at most 50 characters long"),
  clientSecret: z.string().trim().min(1, "Client Secret required"),
  tenantId: z.string().uuid().trim().min(1, "Tenant ID required")
});

export const AzureEntraIdConnectionClientSecretOutputCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  accessToken: z.string(),
  expiresAt: z.number()
});

export const ValidateAzureEntraIdConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureEntraIdConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureEntraId).method),
    credentials: AzureEntraIdConnectionClientSecretInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureEntraId).credentials
    )
  })
]);

export const CreateAzureEntraIdConnectionSchema = ValidateAzureEntraIdConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureEntraId)
);

export const UpdateAzureEntraIdConnectionSchema = z
  .object({
    credentials: AzureEntraIdConnectionClientSecretInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.AzureEntraId).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureEntraId));

const BaseAzureEntraIdConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureEntraId)
});

export const AzureEntraIdConnectionSchema = z.intersection(
  BaseAzureEntraIdConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureEntraIdConnectionMethod.ClientSecret),
      credentials: AzureEntraIdConnectionClientSecretOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureEntraIdConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureEntraIdConnectionSchema.extend({
    method: z.literal(AzureEntraIdConnectionMethod.ClientSecret),
    credentials: AzureEntraIdConnectionClientSecretOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureEntraId]} (Client Secret)` }))
]);

export const AzureEntraIdConnectionListItemSchema = z
  .object({
    name: z.literal("Azure Entra ID"),
    app: z.literal(AppConnection.AzureEntraId),
    methods: z.nativeEnum(AzureEntraIdConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureEntraId] }));
