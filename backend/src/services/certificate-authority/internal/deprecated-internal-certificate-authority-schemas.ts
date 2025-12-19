import { CaType } from "../certificate-authority-enums";
import {
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../deprecated-certificate-authority-schemas";
import { InternalCertificateAuthorityConfigurationSchema } from "./internal-certificate-authority-schemas";

export const CreateInternalCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.INTERNAL
).extend({
  configuration: InternalCertificateAuthorityConfigurationSchema
});

export const UpdateInternalCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.INTERNAL);
