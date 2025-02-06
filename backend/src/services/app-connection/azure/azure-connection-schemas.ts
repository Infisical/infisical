import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AzureConnectionMethod, AzureResources } from "./azure-connection-enums";

export const AzureConnectionOAuthInputCredentialsSchema = z.object({
  code: z.string().trim().min(1, "OAuth code required"),
  tenantId: z.string().trim().optional(),
  resource: z.nativeEnum(AzureResources)
});

export const AzureConnectionOAuthOutputCredentialsSchema = z.object({
  tenantId: z.string().optional(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(), // unix timestamp,
  resource: z.nativeEnum(AzureResources)
});

export const ValidateAzureConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(AzureConnectionMethod.OAuth).describe(AppConnections.CREATE(AppConnection.Azure).method),
    credentials: AzureConnectionOAuthInputCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Azure).credentials
    )
  })
]);

export const CreateAzureConnectionSchema = ValidateAzureConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Azure)
);

export const UpdateAzureConnectionSchema = z
  .object({
    credentials: AzureConnectionOAuthInputCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Azure).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Azure));

const BaseAzureConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Azure) });

export const AzureConnectionSchema = z.intersection(
  BaseAzureConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AzureConnectionMethod.OAuth),
      credentials: AzureConnectionOAuthOutputCredentialsSchema
    })
  ])
);

export const SanitizedAzureConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureConnectionSchema.extend({
    method: z.literal(AzureConnectionMethod.OAuth),
    credentials: AzureConnectionOAuthOutputCredentialsSchema.pick({
      resource: true
    })
  })
]);

export const AzureConnectionListItemSchema = z.object({
  name: z.literal("Azure"),
  app: z.literal(AppConnection.Azure),
  methods: z.nativeEnum(AzureConnectionMethod).array(),
  oauthClientId: z.string().optional()
});
