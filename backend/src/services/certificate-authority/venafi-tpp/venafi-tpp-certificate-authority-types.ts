import { z } from "zod";

import {
  CreateVenafiTppCertificateAuthoritySchema,
  UpdateVenafiTppCertificateAuthoritySchema,
  VenafiTppCertificateAuthoritySchema
} from "./venafi-tpp-certificate-authority-schemas";

export type TVenafiTppCertificateAuthority = z.infer<typeof VenafiTppCertificateAuthoritySchema>;

export type TCreateVenafiTppCertificateAuthorityDTO = z.infer<typeof CreateVenafiTppCertificateAuthoritySchema>;

export type TUpdateVenafiTppCertificateAuthorityDTO = z.infer<typeof UpdateVenafiTppCertificateAuthoritySchema>;
