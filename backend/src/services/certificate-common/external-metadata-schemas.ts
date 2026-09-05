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

export const ImportExternalMetadataSchema = z.discriminatedUnion("type", [DigiCertExternalMetadataSchema]);

export type TImportExternalMetadata = z.infer<typeof ImportExternalMetadataSchema>;

type TCertificateImportVerifierDeps = {
  digicertFns: {
    assertOrderMatchesCertificate: (args: { caId: string; orderId: number; serialNumber: string }) => Promise<void>;
  };
};

type TCertificateImportLinkage = {
  externalMetadataSchema: z.ZodTypeAny | null;
  referenceLabel?: string;
  verifyCertificate?: (
    args: { caId: string; externalMetadata: TImportExternalMetadata; serialNumber: string },
    deps: TCertificateImportVerifierDeps
  ) => Promise<void>;
};

export const CertificateImportLinkageMap: Partial<Record<CaType, TCertificateImportLinkage>> = {
  [CaType.INTERNAL]: { externalMetadataSchema: null },
  [CaType.DIGICERT]: {
    externalMetadataSchema: DigiCertExternalMetadataSchema,
    referenceLabel: "DigiCert order ID",
    verifyCertificate: ({ caId, externalMetadata, serialNumber }, { digicertFns }) =>
      digicertFns.assertOrderMatchesCertificate({ caId, orderId: externalMetadata.orderId, serialNumber })
  }
};

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
