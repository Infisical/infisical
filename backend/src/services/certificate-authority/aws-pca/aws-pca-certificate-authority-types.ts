import { z } from "zod";

import {
  AwsPcaCertificateAuthoritySchema,
  CreateAwsPcaCertificateAuthoritySchema,
  UpdateAwsPcaCertificateAuthoritySchema
} from "./aws-pca-certificate-authority-schemas";

export type TAwsPcaCertificateAuthority = z.infer<typeof AwsPcaCertificateAuthoritySchema>;

export type TCreateAwsPcaCertificateAuthorityDTO = z.infer<typeof CreateAwsPcaCertificateAuthoritySchema>;

export type TUpdateAwsPcaCertificateAuthorityDTO = z.infer<typeof UpdateAwsPcaCertificateAuthoritySchema>;
