import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const AwsPcaCertificateAuthorityConfigurationSchema = z.object({
  appConnectionId: z.string().uuid().trim().describe(CertificateAuthorities.CONFIGURATIONS.AWS_PCA.appConnectionId),
  certificateAuthorityArn: z
    .string()
    .trim()
    .min(1, "Certificate Authority ARN is required")
    .describe(CertificateAuthorities.CONFIGURATIONS.AWS_PCA.certificateAuthorityArn),
  region: z.nativeEnum(AWSRegion).describe(CertificateAuthorities.CONFIGURATIONS.AWS_PCA.region)
});

export const AwsPcaCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.AWS_PCA),
  configuration: AwsPcaCertificateAuthorityConfigurationSchema
});

export const CreateAwsPcaCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.AWS_PCA
).extend({
  configuration: AwsPcaCertificateAuthorityConfigurationSchema
});

export const UpdateAwsPcaCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.AWS_PCA
).extend({
  configuration: AwsPcaCertificateAuthorityConfigurationSchema.optional()
});
