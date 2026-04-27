import { z } from "zod";

import {
  CreateDigiCertCertificateAuthoritySchema,
  DigiCertCertificateAuthoritySchema,
  DigiCertCertificateRequestMetadataSchema,
  UpdateDigiCertCertificateAuthoritySchema
} from "./digicert-certificate-authority-schemas";

export type TDigiCertCertificateAuthority = z.infer<typeof DigiCertCertificateAuthoritySchema>;

export type TCreateDigiCertCertificateAuthorityDTO = z.infer<typeof CreateDigiCertCertificateAuthoritySchema>;

export type TUpdateDigiCertCertificateAuthorityDTO = z.infer<typeof UpdateDigiCertCertificateAuthoritySchema>;

export type TDigiCertCertificateRequestMetadata = z.infer<typeof DigiCertCertificateRequestMetadataSchema>;
