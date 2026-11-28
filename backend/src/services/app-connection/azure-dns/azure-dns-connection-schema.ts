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
import { refineCredentialRotationMethod } from "../credential-rotation/app-connection-credential-rotation-schemas";
import { AzureConnectionFederatedCredentialSchema } from "../shared/azure/azure-managed-identity-schemas";
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
  subscriptionId: azureGuidSchema.describe("Subscription ID must be a valid GUID"),
  clientSecretKeyId: z
    .string()
    .trim()
    .refine((val) => AZURE_GUID_REGEX.test(val), { message: "Invalid GUID format" })
    .optional()
    .describe(
      "The Key ID of the client secret in Azure AD. Required when enabling credential rotation so the original secret can be revoked."
    )
});

export const AzureDnsConnectionManagedIdentityCredentialsSchema = z.object({
  tenantId: azureGuidSchema.describe("Tenant ID must be a valid GUID"),
  clientId: azureGuidSchema.describe("Client ID must be a valid GUID"),
  subscriptionId: azureGuidSchema.describe("Subscription ID must be a valid GUID")
});

const BaseAzureDnsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureDNS)
});

export const AzureDnsConnectionSchema = z.intersection(
  BaseAzureDnsConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureDnsConnectionMethod.ClientSecret),
      credentials: AzureDnsConnectionClientSecretCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureDnsConnectionMethod.ManagedIdentity),
      credentials: AzureDnsConnectionManagedIdentityCredentialsSchema
    })
  ])
);

export const SanitizedAzureDnsConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureDnsConnectionSchema.extend({
    method: z.literal(AzureDnsConnectionMethod.ClientSecret),
    credentials: AzureDnsConnectionClientSecretCredentialsSchema.pick({ tenantId: true, subscriptionId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDNS]} (Client Secret)` })),
  BaseAzureDnsConnectionSchema.extend({
    method: z.literal(AzureDnsConnectionMethod.ManagedIdentity),
    credentials: AzureDnsConnectionManagedIdentityCredentialsSchema.extend({
      federatedCredential: AzureConnectionFederatedCredentialSchema
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDNS]} (Managed Identity)` }))
]);

export const ValidateAzureDnsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureDnsConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureDNS).method),
    credentials: AzureDnsConnectionClientSecretCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDNS).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureDnsConnectionMethod.ManagedIdentity)
      .describe(AppConnections.CREATE(AppConnection.AzureDNS).method),
    credentials: AzureDnsConnectionManagedIdentityCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDNS).credentials
    )
  })
]);

export const CreateAzureDnsConnectionSchema = ValidateAzureDnsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureDNS, {
    supportsCredentialRotation: true
  })
).superRefine(refineCredentialRotationMethod(AzureDnsConnectionMethod.ClientSecret));

export const UpdateAzureDnsConnectionSchema = z
  .object({
    credentials: z
      .union([AzureDnsConnectionClientSecretCredentialsSchema, AzureDnsConnectionManagedIdentityCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureDNS).credentials)
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureDNS, {
      supportsCredentialRotation: true
    })
  );

export const AzureDnsConnectionListItemSchema = z
  .object({
    name: z.literal("Azure DNS"),
    app: z.literal(AppConnection.AzureDNS),
    methods: z.nativeEnum(AzureDnsConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureDNS] }));
