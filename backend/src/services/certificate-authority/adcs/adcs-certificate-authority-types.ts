import { z } from "zod";

import {
  ADCSCertificateAuthoritySchema,
  CreateADCSCertificateAuthoritySchema,
  UpdateADCSCertificateAuthoritySchema
} from "./adcs-certificate-authority-schemas";

export type TADCSCertificateAuthority = z.infer<typeof ADCSCertificateAuthoritySchema>;

export type TCreateADCSCertificateAuthorityDTO = z.infer<typeof CreateADCSCertificateAuthoritySchema>;

export type TUpdateADCSCertificateAuthorityDTO = z.infer<typeof UpdateADCSCertificateAuthoritySchema>;
