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
  // soon, differentiate via the provider property
  dnsProviderConfig: z.object({
    provider: z.nativeEnum(AcmeDnsProvider),
    hostedZoneId: z.string().trim().min(1)
  }),
  directoryUrl: z.string().trim().min(1),
  accountEmail: z.string().trim().min(1)
});

export const AcmeCertificateAuthorityCredentialsSchema = z.object({
  accountKey: z.string()
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
