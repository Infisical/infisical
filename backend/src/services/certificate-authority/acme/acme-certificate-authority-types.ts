import { z } from "zod";

import {
  AcmeCertificateAuthoritySchema,
  CreateAcmeCertificateAuthoritySchema,
  UpdateAcmeCertificateAuthoritySchema
} from "./acme-certificate-authority-schemas";

export type TAcmeCertificateAuthority = z.infer<typeof AcmeCertificateAuthoritySchema>;

export type TAcmeCertificateAuthorityInput = z.infer<typeof CreateAcmeCertificateAuthoritySchema>;

export type TCreateAcmeCertificateAuthorityDTO = z.infer<typeof CreateAcmeCertificateAuthoritySchema>;

export type TUpdateAcmeCertificateAuthorityDTO = z.infer<typeof UpdateAcmeCertificateAuthoritySchema>;
