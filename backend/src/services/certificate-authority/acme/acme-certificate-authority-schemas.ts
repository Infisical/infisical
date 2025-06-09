import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { AcmeDnsProvider } from "./acme-certificate-authority-enums";

export const AcmeCertificateAuthorityConfigurationSchema = z.object({
  dnsAppConnectionId: z.string().uuid().trim().describe(CertificateAuthorities.CONFIGURATIONS.ACME.dnsAppConnectionId),
  // soon, differentiate via the provider property
  dnsProviderConfig: z.object({
    provider: z.nativeEnum(AcmeDnsProvider).describe(CertificateAuthorities.CONFIGURATIONS.ACME.provider),
    hostedZoneId: z.string().trim().min(1).describe(CertificateAuthorities.CONFIGURATIONS.ACME.hostedZoneId)
  }),
  directoryUrl: z.string().url().trim().min(1).describe(CertificateAuthorities.CONFIGURATIONS.ACME.directoryUrl),
  accountEmail: z.string().trim().min(1).describe(CertificateAuthorities.CONFIGURATIONS.ACME.accountEmail)
});

export const AcmeCertificateAuthorityCredentialsSchema = z.object({
  accountKey: z.string()
});

export const AcmeCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.ACME),
  configuration: AcmeCertificateAuthorityConfigurationSchema
});

export const CreateAcmeCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema
});

export const UpdateAcmeCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema.optional()
});
