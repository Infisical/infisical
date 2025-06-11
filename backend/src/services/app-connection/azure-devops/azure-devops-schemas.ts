import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

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

export const AzureDevOpsConnectionApiTokenInputCredentialsSchema = z.object({
  accessToken: z.string().trim().min(1, "Access Token required"),
  orgName: z.string().trim().min(1, "Organization name required")
});

export const AzureDevOpsConnectionApiTokenOutputCredentialsSchema = z.object({
  accessToken: z.string(),
  orgName: z.string()
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
    credentials: AzureDevOpsConnectionApiTokenInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureDevOps).credentials
    )
  })
]);

export const CreateAzureDevOpsConnectionSchema = ValidateAzureDevOpsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureDevOps)
);

export const UpdateAzureDevOpsConnectionSchema = z
  .object({
    credentials: z
      .union([AzureDevOpsConnectionOAuthInputCredentialsSchema, AzureDevOpsConnectionApiTokenInputCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AzureDevOps).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureDevOps));

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
      credentials: AzureDevOpsConnectionApiTokenOutputCredentialsSchema
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
  }),
  BaseAzureDevOpsConnectionSchema.extend({
    method: z.literal(AzureDevOpsConnectionMethod.AccessToken),
    credentials: AzureDevOpsConnectionApiTokenOutputCredentialsSchema.pick({
      orgName: true
    })
  })
]);

export const AzureDevOpsConnectionListItemSchema = z.object({
  name: z.literal("Azure DevOps"),
  app: z.literal(AppConnection.AzureDevOps),
  methods: z.nativeEnum(AzureDevOpsConnectionMethod).array(),
  oauthClientId: z.string().optional()
});
