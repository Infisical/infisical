import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const AwsAcmPublicCaCertificateAuthorityConfigurationSchema = z.object({
  appConnectionId: z
    .string()
    .uuid()
    .trim()
    .describe(CertificateAuthorities.CONFIGURATIONS.AWS_ACM_PUBLIC_CA.appConnectionId),
  dnsAppConnectionId: z
    .string()
    .uuid()
    .trim()
    .describe(CertificateAuthorities.CONFIGURATIONS.AWS_ACM_PUBLIC_CA.dnsAppConnectionId),
  hostedZoneId: z
    .string()
    .trim()
    .min(1, "Hosted Zone ID is required")
    .describe(CertificateAuthorities.CONFIGURATIONS.AWS_ACM_PUBLIC_CA.hostedZoneId),
  region: z.nativeEnum(AWSRegion).describe(CertificateAuthorities.CONFIGURATIONS.AWS_ACM_PUBLIC_CA.region)
});

export const AwsAcmPublicCaCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.AWS_ACM_PUBLIC_CA),
  configuration: AwsAcmPublicCaCertificateAuthorityConfigurationSchema
});

export const CreateAwsAcmPublicCaCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.AWS_ACM_PUBLIC_CA
).extend({
  configuration: AwsAcmPublicCaCertificateAuthorityConfigurationSchema
});

export const UpdateAwsAcmPublicCaCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.AWS_ACM_PUBLIC_CA
).extend({
  configuration: AwsAcmPublicCaCertificateAuthorityConfigurationSchema.optional()
});
