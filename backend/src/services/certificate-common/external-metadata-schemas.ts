import { z } from "zod";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { AwsAcmValidationMethod } from "@app/services/certificate-authority/aws-acm-public-ca/aws-acm-public-ca-certificate-authority-enums";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

export const AwsAcmPublicCaExternalMetadataSchema = z.object({
  type: z.literal(CaType.AWS_ACM_PUBLIC_CA),
  arn: z.string(),
  region: z.nativeEnum(AWSRegion),
  validationMethod: z.nativeEnum(AwsAcmValidationMethod)
});

export type TAwsAcmPublicCaExternalMetadata = z.infer<typeof AwsAcmPublicCaExternalMetadataSchema>;

export const DigiCertExternalMetadataSchema = z.object({
  type: z.literal(CaType.DIGICERT),
  orderId: z.number().int().positive().safe()
});

export type TDigiCertExternalMetadata = z.infer<typeof DigiCertExternalMetadataSchema>;

export const GoDaddyExternalMetadataSchema = z.object({
  type: z.literal(CaType.GODADDY),
  certificateId: z.string().trim().min(1)
});

export type TGoDaddyExternalMetadata = z.infer<typeof GoDaddyExternalMetadataSchema>;

export const ExternalMetadataSchema = z.discriminatedUnion("type", [
  AwsAcmPublicCaExternalMetadataSchema,
  DigiCertExternalMetadataSchema,
  GoDaddyExternalMetadataSchema
]);

export type TExternalMetadata = z.infer<typeof ExternalMetadataSchema>;

export const CertificateImportLinkageMap: Partial<
  Record<CaType, { externalMetadataSchema: z.ZodTypeAny | null; referenceLabel?: string }>
> = {
  [CaType.INTERNAL]: { externalMetadataSchema: null },
  [CaType.DIGICERT]: { externalMetadataSchema: DigiCertExternalMetadataSchema, referenceLabel: "DigiCert order ID" }
};

export const ImportExternalMetadataSchema = z.discriminatedUnion("type", [DigiCertExternalMetadataSchema]);

export type TImportExternalMetadata = z.infer<typeof ImportExternalMetadataSchema>;

export const CA_TYPE_LABEL: Record<CaType, string> = {
  [CaType.INTERNAL]: "Internal CA",
  [CaType.ACME]: "ACME",
  [CaType.ADCS]: "Microsoft ADCS",
  [CaType.AZURE_AD_CS]: "Azure ADCS",
  [CaType.AWS_PCA]: "AWS Private CA",
  [CaType.AWS_ACM_PUBLIC_CA]: "AWS ACM Public CA",
  [CaType.DIGICERT]: "DigiCert CertCentral",
  [CaType.VENAFI_TPP]: "Venafi TPP",
  [CaType.GODADDY]: "GoDaddy"
};
