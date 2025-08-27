import { z } from "zod";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const AzureAdCsCertificateAuthorityConfigurationSchema = z.object({
  azureAdcsConnectionId: z.string().uuid().trim().describe("Azure ADCS Connection ID")
});

export const AzureAdCsCertificateAuthorityCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string().optional(),
    certificateThumbprint: z.string().optional()
  })
  .refine((data) => data.clientSecret || data.certificateThumbprint, {
    message: "At least one authentication method (clientSecret or certificateThumbprint) must be provided",
    path: ["clientSecret"]
  });

export const AzureAdCsCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.AZURE_AD_CS),
  configuration: AzureAdCsCertificateAuthorityConfigurationSchema
});

export const CreateAzureAdCsCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.AZURE_AD_CS
).extend({
  configuration: AzureAdCsCertificateAuthorityConfigurationSchema
});

export const UpdateAzureAdCsCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.AZURE_AD_CS
).extend({
  configuration: AzureAdCsCertificateAuthorityConfigurationSchema.optional()
});
