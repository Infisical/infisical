import { z } from "zod";

import {
  CreateGoDaddyCertificateAuthoritySchema,
  GoDaddyCertificateAuthoritySchema,
  GoDaddyCertificateRequestMetadataSchema,
  UpdateGoDaddyCertificateAuthoritySchema
} from "./godaddy-certificate-authority-schemas";

export type TGoDaddyCertificateAuthority = z.infer<typeof GoDaddyCertificateAuthoritySchema>;

export type TCreateGoDaddyCertificateAuthorityDTO = z.infer<typeof CreateGoDaddyCertificateAuthoritySchema>;

export type TUpdateGoDaddyCertificateAuthorityDTO = z.infer<typeof UpdateGoDaddyCertificateAuthoritySchema>;

export type TGoDaddyCertificateRequestMetadata = z.infer<typeof GoDaddyCertificateRequestMetadataSchema>;
