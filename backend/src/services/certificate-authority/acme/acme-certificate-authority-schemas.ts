import { z } from "zod";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { AcmeDnsProvider } from "./acme-certificate-authority-enums";

export const AcmeCertificateAuthorityConfigurationSchema = z.object({
  dnsAppConnectionId: z.string().trim(),
  dnsProvider: z.nativeEnum(AcmeDnsProvider),
  directoryUrl: z.string().trim(),
  accountEmail: z.string().trim()
});

export const AcmeCertificateAuthoritySchema = BaseCertificateAuthoritySchema(CaType.ACME).extend({
  type: z.literal(CaType.ACME),
  configuration: AcmeCertificateAuthorityConfigurationSchema
});

export const CreateAcmeCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema
});

export const UpdateAcmeCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema.optional()
});
