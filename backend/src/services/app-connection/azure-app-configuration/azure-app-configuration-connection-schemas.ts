import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
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

export const AzureAppConfigurationConnectionClientSecretInputCredentialsSchema = z.object({
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

export const AzureAppConfigurationConnectionClientSecretOutputCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  accessToken: z.string(),
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
  }),
  z.object({
    method: z
      .literal(AzureAppConfigurationConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureAppConfiguration).method),
    credentials: AzureAppConfigurationConnectionClientSecretInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureAppConfiguration).credentials
    )
  })
]);

export const CreateAzureAppConfigurationConnectionSchema = ValidateAzureAppConfigurationConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureAppConfiguration)
);

export const UpdateAzureAppConfigurationConnectionSchema = z
  .object({
    credentials: z
      .union([
        AzureAppConfigurationConnectionOAuthInputCredentialsSchema,
        AzureAppConfigurationConnectionClientSecretInputCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureAppConfiguration).credentials)
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
    }),
    z.object({
      method: z.literal(AzureAppConfigurationConnectionMethod.ClientSecret),
      credentials: AzureAppConfigurationConnectionClientSecretOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureAppConfigurationConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureAppConfigurationConnectionSchema.extend({
    method: z.literal(AzureAppConfigurationConnectionMethod.OAuth),
    credentials: AzureAppConfigurationConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureAppConfiguration]} (OAuth)` })),
  BaseAzureAppConfigurationConnectionSchema.extend({
    method: z.literal(AzureAppConfigurationConnectionMethod.ClientSecret),
    credentials: AzureAppConfigurationConnectionClientSecretOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true
    })
  }).describe(
    JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureAppConfiguration]} (Client Secret)` })
  )
]);

export const AzureAppConfigurationConnectionListItemSchema = z
  .object({
    name: z.literal("Azure App Configuration"),
    app: z.literal(AppConnection.AzureAppConfiguration),
    methods: z.nativeEnum(AzureAppConfigurationConnectionMethod).array(),
    oauthClientId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureAppConfiguration] }));
