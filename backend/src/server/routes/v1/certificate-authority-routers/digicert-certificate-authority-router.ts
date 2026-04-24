import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  CreateDigiCertCertificateAuthoritySchema,
  DigiCertCertificateAuthoritySchema,
  UpdateDigiCertCertificateAuthoritySchema
} from "@app/services/certificate-authority/digicert/digicert-certificate-authority-schemas";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerDigiCertCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.DIGICERT,
    server,
    responseSchema: DigiCertCertificateAuthoritySchema,
    createSchema: CreateDigiCertCertificateAuthoritySchema,
    updateSchema: UpdateDigiCertCertificateAuthoritySchema
  });
};
