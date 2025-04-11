import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { TerraformCloudConnectionMethod } from "./terraform-cloud-connection-enums";

export const TerraformCloudConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.TERRAFORM_CLOUD.apiToken)
});

const BaseTerraformCloudConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.TerraformCloud)
});

export const TerraformCloudConnectionSchema = BaseTerraformCloudConnectionSchema.extend({
  method: z.literal(TerraformCloudConnectionMethod.ApiToken),
  credentials: TerraformCloudConnectionAccessTokenCredentialsSchema
});

export const SanitizedTerraformCloudConnectionSchema = z.discriminatedUnion("method", [
  BaseTerraformCloudConnectionSchema.extend({
    method: z.literal(TerraformCloudConnectionMethod.ApiToken),
    credentials: TerraformCloudConnectionAccessTokenCredentialsSchema.pick({})
  })
]);

export const ValidateTerraformCloudConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(TerraformCloudConnectionMethod.ApiToken)
      .describe(AppConnections?.CREATE(AppConnection.TerraformCloud).method),
    credentials: TerraformCloudConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.TerraformCloud).credentials
    )
  })
]);

export const CreateTerraformCloudConnectionSchema = ValidateTerraformCloudConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.TerraformCloud)
);

export const UpdateTerraformCloudConnectionSchema = z
  .object({
    credentials: TerraformCloudConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.TerraformCloud).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.TerraformCloud));

export const TerraformCloudConnectionListItemSchema = z.object({
  name: z.literal("Terraform Cloud"),
  app: z.literal(AppConnection.TerraformCloud),
  methods: z.nativeEnum(TerraformCloudConnectionMethod).array()
});
