import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AzureAppConfigurationConnectionMethod } from "./azure-app-configuration-connection-enums";

export const AzureAppConfigurationConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required"),
  tenantId: z.string().trim().optional()
});

export const AzureAppConfigurationConnectionOAuthOutputCredentialsSchema = z.object({
  tenantId: z.string().optional(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number()
});

export const ValidateAzureAppConfigurationConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureAppConfigurationConnectionMethod.OAuth)
      .describe(AppConnections.CREATE(AppConnection.AzureAppConfiguration).method),
    credentials: AzureAppConfigurationConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureAppConfiguration).credentials
    )
  })
]);

export const CreateAzureAppConfigurationConnectionSchema = ValidateAzureAppConfigurationConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureAppConfiguration)
);

export const UpdateAzureAppConfigurationConnectionSchema = z
  .object({
    credentials: AzureAppConfigurationConnectionOAuthInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.AzureAppConfiguration).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureAppConfiguration));

const BaseAzureAppConfigurationConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureAppConfiguration)
});

export const AzureAppConfigurationConnectionSchema = z.intersection(
  BaseAzureAppConfigurationConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureAppConfigurationConnectionMethod.OAuth),
      credentials: AzureAppConfigurationConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureAppConfigurationConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureAppConfigurationConnectionSchema.extend({
    method: z.literal(AzureAppConfigurationConnectionMethod.OAuth),
    credentials: AzureAppConfigurationConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true
    })
  })
]);

export const AzureAppConfigurationConnectionListItemSchema = z.object({
  name: z.literal("Azure App Configuration"),
  app: z.literal(AppConnection.AzureAppConfiguration),
  methods: z.nativeEnum(AzureAppConfigurationConnectionMethod).array(),
  oauthClientId: z.string().optional()
});
