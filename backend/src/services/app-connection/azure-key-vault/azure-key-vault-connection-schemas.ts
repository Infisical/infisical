import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AzureKeyVaultConnectionMethod } from "./azure-key-vault-connection-enums";

export const AzureKeyVaultConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required"),
  tenantId: z.string().trim().optional()
});

export const AzureKeyVaultConnectionOAuthOutputCredentialsSchema = z.object({
  tenantId: z.string().optional(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number()
});

export const AzureKeyVaultConnectionClientSecretInputCredentialsSchema = z.object({
  clientId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Client ID required")
    .max(50, "Client ID must be at most 50 characters long"),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .max(50, "Client Secret must be at most 50 characters long"),
  tenantId: z.string().uuid().trim().min(1, "Tenant ID required")
});

export const AzureKeyVaultConnectionClientSecretOutputCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  accessToken: z.string(),
  expiresAt: z.number()
});

export const ValidateAzureKeyVaultConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureKeyVaultConnectionMethod.OAuth)
      .describe(AppConnections.CREATE(AppConnection.AzureKeyVault).method),
    credentials: AzureKeyVaultConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureKeyVault).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureKeyVaultConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureKeyVault).method),
    credentials: AzureKeyVaultConnectionClientSecretInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureKeyVault).credentials
    )
  })
]);

export const CreateAzureKeyVaultConnectionSchema = ValidateAzureKeyVaultConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureKeyVault)
);

export const UpdateAzureKeyVaultConnectionSchema = z
  .object({
    credentials: z
      .union([
        AzureKeyVaultConnectionOAuthInputCredentialsSchema,
        AzureKeyVaultConnectionClientSecretInputCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureKeyVault).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureKeyVault));

const BaseAzureKeyVaultConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureKeyVault)
});

export const AzureKeyVaultConnectionSchema = z.intersection(
  BaseAzureKeyVaultConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureKeyVaultConnectionMethod.OAuth),
      credentials: AzureKeyVaultConnectionOAuthOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureKeyVaultConnectionMethod.ClientSecret),
      credentials: AzureKeyVaultConnectionClientSecretOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureKeyVaultConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureKeyVaultConnectionSchema.extend({
    method: z.literal(AzureKeyVaultConnectionMethod.OAuth),
    credentials: AzureKeyVaultConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureKeyVault]} (OAuth)` })),
  BaseAzureKeyVaultConnectionSchema.extend({
    method: z.literal(AzureKeyVaultConnectionMethod.ClientSecret),
    credentials: AzureKeyVaultConnectionClientSecretOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureKeyVault]} (Client Secret)` }))
]);

export const AzureKeyVaultConnectionListItemSchema = z
  .object({
    name: z.literal("Azure Key Vault"),
    app: z.literal(AppConnection.AzureKeyVault),
    methods: z.nativeEnum(AzureKeyVaultConnectionMethod).array(),
    oauthClientId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureKeyVault] }));
