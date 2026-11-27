import { z } from "zod";

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
import { AzureDevOpsConnectionMethod } from "./azure-devops-enums";

export const AzureDevOpsConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required").describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.code),
  tenantId: z.string().trim().min(1, "Tenant ID required").describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.tenantId),
  orgName: z
    .string()
    .trim()
    .min(1, "Organization name required")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.orgName)
});

export const AzureDevOpsConnectionOAuthOutputCredentialsSchema = z.object({
  tenantId: z.string(),
  orgName: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number()
});

export const AzureDevOpsConnectionAccessTokenInputCredentialsSchema = z.object({
  accessToken: z.string().trim().min(1, "Access Token required"),
  orgName: z.string().trim().min(1, "Organization name required")
});

export const AzureDevOpsConnectionAccessTokenOutputCredentialsSchema = z.object({
  accessToken: z.string(),
  orgName: z.string()
});

export const AzureDevOpsConnectionClientSecretInputCredentialsSchema = z.object({
  clientId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Client ID required")
    .max(50, "Client ID must be at most 50 characters long")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.clientId),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Client Secret required")
    .max(50, "Client Secret must be at most 50 characters long")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.clientSecret),
  tenantId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Tenant ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.tenantId),
  orgName: z
    .string()
    .trim()
    .min(1, "Organization name required")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.orgName),
  clientSecretKeyId: z
    .string()
    .uuid()
    .trim()
    .optional()
    .describe(
      "The Key ID of the client secret in Azure AD. Required when enabling credential rotation so the original secret can be revoked."
    )
});

export const AzureDevOpsConnectionClientSecretOutputCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  orgName: z.string(),
  clientSecretKeyId: z.string().optional(),
  accessToken: z.string(),
  expiresAt: z.number()
});

export const AzureDevOpsConnectionManagedIdentityInputCredentialsSchema = z.object({
  tenantId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Tenant ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.tenantId),
  clientId: z
    .string()
    .uuid()
    .trim()
    .min(1, "Client ID required")
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.clientId),
  // Azure DevOps' own naming rules. The older methods don't enforce them because tightening their input would
  // reject requests callers already send.
  orgName: z
    .string()
    .trim()
    .min(1, "Organization name required")
    .max(50, "Organization name must be at most 50 characters long")
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
      "Organization name must start and end with a letter or number, and contain only letters, numbers and hyphens"
    )
    .describe(AppConnections.CREDENTIALS.AZURE_DEVOPS.orgName)
});

export const AzureDevOpsConnectionManagedIdentityOutputCredentialsSchema = z.object({
  tenantId: z.string(),
  clientId: z.string(),
  orgName: z.string(),
  accessToken: z.string().optional(),
  expiresAt: z.number().optional()
});

export const ValidateAzureDevOpsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureDevOpsConnectionMethod.OAuth)
      .describe(AppConnections.CREATE(AppConnection.AzureDevOps).method),
    credentials: AzureDevOpsConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDevOps).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureDevOpsConnectionMethod.AccessToken)
      .describe(AppConnections.CREATE(AppConnection.AzureDevOps).method),
    credentials: AzureDevOpsConnectionAccessTokenInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDevOps).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureDevOpsConnectionMethod.ClientSecret)
      .describe(AppConnections.CREATE(AppConnection.AzureDevOps).method),
    credentials: AzureDevOpsConnectionClientSecretInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDevOps).credentials
    )
  }),
  z.object({
    method: z
      .literal(AzureDevOpsConnectionMethod.ManagedIdentity)
      .describe(AppConnections.CREATE(AppConnection.AzureDevOps).method),
    credentials: AzureDevOpsConnectionManagedIdentityInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDevOps).credentials
    )
  })
]);

export const CreateAzureDevOpsConnectionSchema = ValidateAzureDevOpsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureDevOps, {
    supportsCredentialRotation: true
  })
).superRefine(refineCredentialRotationMethod(AzureDevOpsConnectionMethod.ClientSecret));

export const UpdateAzureDevOpsConnectionSchema = z
  .object({
    credentials: z
      .union([
        AzureDevOpsConnectionOAuthInputCredentialsSchema,
        AzureDevOpsConnectionAccessTokenInputCredentialsSchema,
        AzureDevOpsConnectionClientSecretInputCredentialsSchema,
        AzureDevOpsConnectionManagedIdentityInputCredentialsSchema
      ])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureDevOps).credentials)
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureDevOps, {
      supportsCredentialRotation: true
    })
  );

const BaseAzureDevOpsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.AzureDevOps)
});

export const AzureDevOpsConnectionSchema = z.intersection(
  BaseAzureDevOpsConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureDevOpsConnectionMethod.OAuth),
      credentials: AzureDevOpsConnectionOAuthOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureDevOpsConnectionMethod.AccessToken),
      credentials: AzureDevOpsConnectionAccessTokenOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureDevOpsConnectionMethod.ClientSecret),
      credentials: AzureDevOpsConnectionClientSecretOutputCredentialsSchema
    }),
    z.object({
      method: z.literal(AzureDevOpsConnectionMethod.ManagedIdentity),
      credentials: AzureDevOpsConnectionManagedIdentityOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureDevOpsConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureDevOpsConnectionSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.OAuth),
    credentials: AzureDevOpsConnectionOAuthOutputCredentialsSchema.pick({
      tenantId: true,
      orgName: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDevOps]} (OAuth)` })),
  BaseAzureDevOpsConnectionSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.AccessToken),
    credentials: AzureDevOpsConnectionAccessTokenOutputCredentialsSchema.pick({
      orgName: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDevOps]} (Access Token)` })),
  BaseAzureDevOpsConnectionSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.ClientSecret),
    credentials: AzureDevOpsConnectionClientSecretOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true,
      orgName: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDevOps]} (Client Secret)` })),
  BaseAzureDevOpsConnectionSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.ManagedIdentity),
    credentials: AzureDevOpsConnectionManagedIdentityOutputCredentialsSchema.pick({
      clientId: true,
      tenantId: true,
      orgName: true
    }).extend({
      federatedCredential: AzureConnectionFederatedCredentialSchema
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureDevOps]} (Managed Identity)` }))
]);

export const AzureDevOpsConnectionListItemSchema = z
  .object({
    name: z.literal("Azure DevOps"),
    app: z.literal(AppConnection.AzureDevOps),
    methods: z.nativeEnum(AzureDevOpsConnectionMethod).array(),
    oauthClientId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureDevOps] }));
