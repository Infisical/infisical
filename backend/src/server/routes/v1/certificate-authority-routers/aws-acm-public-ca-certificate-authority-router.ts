import {
  AwsAcmPublicCaCertificateAuthoritySchema,
  CreateAwsAcmPublicCaCertificateAuthoritySchema,
  UpdateAwsAcmPublicCaCertificateAuthoritySchema
} from "@app/services/certificate-authority/aws-acm-public-ca/aws-acm-public-ca-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerAwsAcmPublicCaCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.AWS_ACM_PUBLIC_CA,
    server,
    responseSchema: AwsAcmPublicCaCertificateAuthoritySchema,
    createSchema: CreateAwsAcmPublicCaCertificateAuthoritySchema,
    updateSchema: UpdateAwsAcmPublicCaCertificateAuthoritySchema
  });
};
