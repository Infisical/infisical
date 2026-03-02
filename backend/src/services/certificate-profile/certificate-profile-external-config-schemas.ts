import { z } from "zod";

import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

/**
 * External configuration schema for Azure AD CS Certificate Authority
 */
export const AzureAdCsExternalConfigSchema = z.object({
  template: z
    .string()
    .min(1, "Template name is required for Azure AD CS")
    .describe("Certificate template name for Azure AD CS")
});

/**
 * External configuration schema for ACME Certificate Authority
 */
export const AcmeExternalConfigSchema = z.object({});

/**
 * External configuration schema for AWS PCA Certificate Authority
 */
export const AwsPcaExternalConfigSchema = z.object({});

/**
 * Map of CA types to their corresponding external configuration schemas
 */
export const ExternalConfigSchemaMap = {
  [CaType.AZURE_AD_CS]: AzureAdCsExternalConfigSchema,
  [CaType.ACME]: AcmeExternalConfigSchema,
  [CaType.AWS_PCA]: AwsPcaExternalConfigSchema,
  [CaType.INTERNAL]: z.object({}).optional() // Internal CAs don't use external configs
} as const;

export const createExternalConfigSchema = (caType?: CaType | null) => {
  if (!caType || caType === CaType.INTERNAL) {
    return z.object({}).nullable().optional();
  }

  const schema = ExternalConfigSchemaMap[caType];
  if (!schema) {
    return z.object({}).nullable().optional();
  }

  return schema.nullable().optional();
};

/**
 * Union type of all possible external configuration schemas
 */
export const ExternalConfigUnionSchema = z
  .union([AzureAdCsExternalConfigSchema, AcmeExternalConfigSchema, AwsPcaExternalConfigSchema, z.object({})])
  .nullable()
  .optional();

export type TExternalConfig = z.infer<typeof ExternalConfigUnionSchema>;
