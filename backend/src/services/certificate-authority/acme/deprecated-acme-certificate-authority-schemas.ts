import { CaType } from "../certificate-authority-enums";
import {
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../deprecated-certificate-authority-schemas";
import { AcmeCertificateAuthorityConfigurationSchema } from "./acme-certificate-authority-schemas";

export const CreateAcmeCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema
});

export const UpdateAcmeCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema.optional()
});
