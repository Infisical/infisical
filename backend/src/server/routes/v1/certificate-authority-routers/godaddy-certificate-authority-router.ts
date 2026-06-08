import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  CreateGoDaddyCertificateAuthoritySchema,
  GoDaddyCertificateAuthoritySchema,
  UpdateGoDaddyCertificateAuthoritySchema
} from "@app/services/certificate-authority/godaddy/godaddy-certificate-authority-schemas";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerGoDaddyCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.GODADDY,
    server,
    responseSchema: GoDaddyCertificateAuthoritySchema,
    createSchema: CreateGoDaddyCertificateAuthoritySchema,
    updateSchema: UpdateGoDaddyCertificateAuthoritySchema
  });
};
