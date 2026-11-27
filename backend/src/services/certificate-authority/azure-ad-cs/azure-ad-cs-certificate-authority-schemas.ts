import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const AzureAdCsCertificateAuthorityConfigurationSchema = z.object({
  azureAdcsConnectionId: z.string().uuid().trim().describe("Azure ADCS Connection ID")
});

export const AzureAdCsCertificateAuthorityCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
  sslRejectUnauthorized: z.boolean().optional(),
  sslCertificate: z.string().optional()
});

export const AzureAdCsCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.AZURE_AD_CS),
  configuration: AzureAdCsCertificateAuthorityConfigurationSchema
});

export const CreateAzureAdCsCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.AZURE_AD_CS
).extend({
  configuration: AzureAdCsCertificateAuthorityConfigurationSchema.describe(
    CertificateAuthorities.CONFIGURATION(CaType.AZURE_AD_CS)
  )
});

export const UpdateAzureAdCsCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.AZURE_AD_CS
).extend({
  configuration: AzureAdCsCertificateAuthorityConfigurationSchema.optional().describe(
    CertificateAuthorities.UPDATE_CONFIGURATION(CaType.AZURE_AD_CS)
  )
});
