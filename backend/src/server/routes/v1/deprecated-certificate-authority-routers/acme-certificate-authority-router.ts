import { AcmeCertificateAuthoritySchema } from "@app/services/certificate-authority/acme/acme-certificate-authority-schemas";
import {
  CreateAcmeCertificateAuthoritySchema,
  UpdateAcmeCertificateAuthoritySchema
} from "@app/services/certificate-authority/acme/deprecated-acme-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerAcmeCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.ACME,
    server,
    responseSchema: AcmeCertificateAuthoritySchema,
    createSchema: CreateAcmeCertificateAuthoritySchema,
    updateSchema: UpdateAcmeCertificateAuthoritySchema
  });
};
