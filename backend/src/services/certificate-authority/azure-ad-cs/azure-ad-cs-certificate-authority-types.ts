import { z } from "zod";

import {
  AzureAdCsCertificateAuthoritySchema,
  CreateAzureAdCsCertificateAuthoritySchema,
  UpdateAzureAdCsCertificateAuthoritySchema
} from "./azure-ad-cs-certificate-authority-schemas";

export type TAzureAdCsCertificateAuthority = z.infer<typeof AzureAdCsCertificateAuthoritySchema>;

export type TCreateAzureAdCsCertificateAuthorityDTO = z.infer<typeof CreateAzureAdCsCertificateAuthoritySchema>;

export type TUpdateAzureAdCsCertificateAuthorityDTO = z.infer<typeof UpdateAzureAdCsCertificateAuthoritySchema>;
