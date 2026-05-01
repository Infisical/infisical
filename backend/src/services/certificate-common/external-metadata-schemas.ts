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
  orderId: z.number().int().positive()
});

export type TDigiCertExternalMetadata = z.infer<typeof DigiCertExternalMetadataSchema>;

export const ExternalMetadataSchema = z.discriminatedUnion("type", [
  AwsAcmPublicCaExternalMetadataSchema,
  DigiCertExternalMetadataSchema
]);

export type TExternalMetadata = z.infer<typeof ExternalMetadataSchema>;
