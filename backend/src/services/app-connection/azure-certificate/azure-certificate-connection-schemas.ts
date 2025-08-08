import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AzureCertificateConnectionMethod } from "./azure-certificate-connection-enums";

export const AzureCertificateConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required").describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.code),
  tenantId: z
    .string()
    .trim()
    .min(1, "Tenant ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.tenantId)
});

export const AzureCertificateConnectionOAuthOutputCredentialsSchema = z.object({
  tenantId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number()
});

export const AzureCertificateConnectionClientSecretInputCredentialsSchema = z.object({
  clientId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Client ID required")
    .max(50, "Client ID must be at most 50 characters long")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.clientId),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .max(50, "Client Secret must be at most 50 characters long")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.clientSecret),
  tenantId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Tenant ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_CLIENT_SECRETS.tenantId)
});

export const AzureCertificateConnectionClientSecretOutputCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  accessToken: z.string(),
  expiresAt: z.number()
});

export const ValidateAzureCertificateConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureCertificateConnectionMethod.OAuth)
      .describe(AppConnections.CREATE(AppConnection.AzureCertificate).method),
    credentials: AzureCertificateConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureCertificate).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureCertificateConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureCertificate).method),
    credentials: AzureCertificateConnectionClientSecretInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureCertificate).credentials
    )
  })
]);

export const CreateAzureCertificateConnectionSchema = ValidateAzureCertificateConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureCertificate)
);

export const UpdateAzureCertificateConnectionSchema = z
  .object({
    credentials: z
      .union([
        AzureCertificateConnectionOAuthInputCredentialsSchema,
        AzureCertificateConnectionClientSecretInputCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureCertificate).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureCertificate));

const BaseAzureCertificateConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureCertificate)
});

export const AzureCertificateConnectionSchema = z.intersection(
  BaseAzureCertificateConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureCertificateConnectionMethod.OAuth),
      credentials: AzureCertificateConnectionOAuthOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureCertificateConnectionMethod.ClientSecret),
      credentials: AzureCertificateConnectionClientSecretOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureCertificateConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureCertificateConnectionSchema.extend({
    method: z.literal(AzureCertificateConnectionMethod.OAuth),
    credentials: AzureCertificateConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true
    })
  }),
  BaseAzureCertificateConnectionSchema.extend({
    method: z.literal(AzureCertificateConnectionMethod.ClientSecret),
    credentials: AzureCertificateConnectionClientSecretOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true
    })
  })
]);

export const AzureCertificateConnectionListItemSchema = z.object({
  name: z.literal("Azure Certificate"),
  app: z.literal(AppConnection.AzureCertificate),
  methods: z.nativeEnum(AzureCertificateConnectionMethod).array(),
  oauthClientId: z.string().optional()
});
