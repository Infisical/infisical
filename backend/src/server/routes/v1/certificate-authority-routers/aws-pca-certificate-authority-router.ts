import {
  AwsPcaCertificateAuthoritySchema,
  CreateAwsPcaCertificateAuthoritySchema,
  UpdateAwsPcaCertificateAuthoritySchema
} from "@app/services/certificate-authority/aws-pca/aws-pca-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerAwsPcaCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.AWS_PCA,
    server,
    responseSchema: AwsPcaCertificateAuthoritySchema,
    createSchema: CreateAwsPcaCertificateAuthoritySchema,
    updateSchema: UpdateAwsPcaCertificateAuthoritySchema
  });
};
