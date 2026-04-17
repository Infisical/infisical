import { z } from "zod";

import {
  AwsAcmPublicCaCertificateAuthoritySchema,
  CreateAwsAcmPublicCaCertificateAuthoritySchema,
  UpdateAwsAcmPublicCaCertificateAuthoritySchema
} from "./aws-acm-public-ca-certificate-authority-schemas";

export type TAwsAcmPublicCaCertificateAuthority = z.infer<typeof AwsAcmPublicCaCertificateAuthoritySchema>;

export type TCreateAwsAcmPublicCaCertificateAuthorityDTO = z.infer<
  typeof CreateAwsAcmPublicCaCertificateAuthoritySchema
>;

export type TUpdateAwsAcmPublicCaCertificateAuthorityDTO = z.infer<
  typeof UpdateAwsAcmPublicCaCertificateAuthoritySchema
>;
