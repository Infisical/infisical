import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AzureClientSecretsConnectionMethod } from "./azure-client-secrets-connection-enums";

export const AzureClientSecretsConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required").describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.code),
  tenantId: z
    .string()
    .trim()
    .min(1, "Tenant ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.tenantId)
});

export const AzureClientSecretsConnectionOAuthOutputCredentialsSchema = z.object({
  tenantId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number()
});

export const AzureClientSecretsConnectionAccessTokenInputCredentialsSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.clientId),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.clientSecret),
  tenantId: z
    .string()
    .trim()
    .min(1, "Tenant ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.tenantId)
});

export const AzureClientSecretsConnectionAccessTokenOutputCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  accessToken: z.string(),
  expiresAt: z.number()
});

export const ValidateAzureClientSecretsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureClientSecretsConnectionMethod.OAuth)
      .describe(AppConnections.CREATE(AppConnection.AzureClientSecrets).method),
    credentials: AzureClientSecretsConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureClientSecrets).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureClientSecretsConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureClientSecrets).method),
    credentials: AzureClientSecretsConnectionAccessTokenInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureClientSecrets).credentials
    )
  })
]);

export const CreateAzureClientSecretsConnectionSchema = ValidateAzureClientSecretsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureClientSecrets)
);

export const UpdateAzureClientSecretsConnectionSchema = z
  .object({
    credentials: z
      .union([
        AzureClientSecretsConnectionOAuthInputCredentialsSchema,
        AzureClientSecretsConnectionAccessTokenInputCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureClientSecrets).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureClientSecrets));

const BaseAzureClientSecretsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureClientSecrets)
});

export const AzureClientSecretsConnectionSchema = z.intersection(
  BaseAzureClientSecretsConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureClientSecretsConnectionMethod.OAuth),
      credentials: AzureClientSecretsConnectionOAuthOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureClientSecretsConnectionMethod.ClientSecret),
      credentials: AzureClientSecretsConnectionAccessTokenOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureClientSecretsConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureClientSecretsConnectionSchema.extend({
    method: z.literal(AzureClientSecretsConnectionMethod.OAuth),
    credentials: AzureClientSecretsConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true
    })
  }),
  BaseAzureClientSecretsConnectionSchema.extend({
    method: z.literal(AzureClientSecretsConnectionMethod.ClientSecret),
    credentials: AzureClientSecretsConnectionAccessTokenOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true
    })
  })
]);

export const AzureClientSecretsConnectionListItemSchema = z.object({
  name: z.literal("Azure Client Secrets"),
  app: z.literal(AppConnection.AzureClientSecrets),
  methods: z.nativeEnum(AzureClientSecretsConnectionMethod).array(),
  oauthClientId: z.string().optional()
});
