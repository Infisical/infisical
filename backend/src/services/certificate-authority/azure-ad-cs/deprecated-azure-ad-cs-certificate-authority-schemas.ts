import { CaType } from "../certificate-authority-enums";
import {
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../deprecated-certificate-authority-schemas";
import { AzureAdCsCertificateAuthorityConfigurationSchema } from "./azure-ad-cs-certificate-authority-schemas";

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
