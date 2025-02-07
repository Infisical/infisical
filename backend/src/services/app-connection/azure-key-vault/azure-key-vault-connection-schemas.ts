import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

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

export const ValidateAzureKeyVaultConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureKeyVaultConnectionMethod.OAuth)
      .describe(AppConnections.CREATE(AppConnection.AzureKeyVault).method),
    credentials: AzureKeyVaultConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureKeyVault).credentials
    )
  })
]);

export const CreateAzureKeyVaultConnectionSchema = ValidateAzureKeyVaultConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureKeyVault)
);

export const UpdateAzureKeyVaultConnectionSchema = z
  .object({
    credentials: AzureKeyVaultConnectionOAuthInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.AzureKeyVault).credentials
    )
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
    })
  ])
);

export const SanitizedAzureKeyVaultConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureKeyVaultConnectionSchema.extend({
    method: z.literal(AzureKeyVaultConnectionMethod.OAuth),
    credentials: AzureKeyVaultConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true
    })
  })
]);

export const AzureKeyVaultConnectionListItemSchema = z.object({
  name: z.literal("Azure Key Vault"),
  app: z.literal(AppConnection.AzureKeyVault),
  methods: z.nativeEnum(AzureKeyVaultConnectionMethod).array(),
  oauthClientId: z.string().optional()
});
