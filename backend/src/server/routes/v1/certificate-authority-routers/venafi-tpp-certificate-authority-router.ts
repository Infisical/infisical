import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  CreateVenafiTppCertificateAuthoritySchema,
  UpdateVenafiTppCertificateAuthoritySchema,
  VenafiTppCertificateAuthoritySchema
} from "@app/services/certificate-authority/venafi-tpp/venafi-tpp-certificate-authority-schemas";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerVenafiTppCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.VENAFI_TPP,
    server,
    responseSchema: VenafiTppCertificateAuthoritySchema,
    createSchema: CreateVenafiTppCertificateAuthoritySchema,
    updateSchema: UpdateVenafiTppCertificateAuthoritySchema
  });
};
