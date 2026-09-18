import RE2 from "re2";
import { z } from "zod";

import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

const RE_NO_NEWLINES = new RE2("^[^\\r\\n]+$");

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
 * External configuration schema for Active Directory Certificate Service Certificate Authority
 */
export const ADCSExternalConfigSchema = z.object({
  template: z
    .string()
    .min(1, "Template name is required for Active Directory Certificate Service")
    .refine((v) => RE_NO_NEWLINES.test(v), "Template name must not contain newline characters")
    .describe("Certificate template name for Active Directory Certificate Service")
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
 * External configuration schema for DigiCert Certificate Authority
 */
export const DigiCertExternalConfigSchema = z.object({});

/**
 * External configuration schema for AWS ACM Public Certificate Authority
 */
export const AwsAcmPublicCaExternalConfigSchema = z.object({});

/**
 * External configuration schema for Venafi TPP Certificate Authority
 */
export const VenafiTppExternalConfigSchema = z.object({});

/**
 * External configuration schema for GoDaddy Certificate Authority
 */
export const GoDaddyExternalConfigSchema = z.object({});

/**
 * Map of CA types to their corresponding external configuration schemas
 */
export const ExternalConfigSchemaMap = {
  [CaType.AZURE_AD_CS]: AzureAdCsExternalConfigSchema,
  [CaType.ADCS]: ADCSExternalConfigSchema,
  [CaType.ACME]: AcmeExternalConfigSchema,
  [CaType.AWS_PCA]: AwsPcaExternalConfigSchema,
  [CaType.DIGICERT]: DigiCertExternalConfigSchema,
  [CaType.AWS_ACM_PUBLIC_CA]: AwsAcmPublicCaExternalConfigSchema,
  [CaType.VENAFI_TPP]: VenafiTppExternalConfigSchema,
  [CaType.GODADDY]: GoDaddyExternalConfigSchema,
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
  .union([
    AzureAdCsExternalConfigSchema,
    ADCSExternalConfigSchema,
    AcmeExternalConfigSchema,
    AwsPcaExternalConfigSchema,
    DigiCertExternalConfigSchema,
    AwsAcmPublicCaExternalConfigSchema,
    VenafiTppExternalConfigSchema,
    GoDaddyExternalConfigSchema,
    z.object({})
  ])
  .nullable()
  .optional();

export type TExternalConfig = z.infer<typeof ExternalConfigUnionSchema>;
