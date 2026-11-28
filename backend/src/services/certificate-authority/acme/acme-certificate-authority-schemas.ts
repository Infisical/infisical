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
  dnsProviderConfig: z
    .object({
      provider: z.nativeEnum(AcmeDnsProvider).describe(CertificateAuthorities.CONFIGURATIONS.ACME.provider),
      hostedZoneId: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.ACME.hostedZoneId)
    })
    // RFC 2136 can detect the zone from the DNS server; every other provider needs it
    .superRefine(({ provider, hostedZoneId }, ctx) => {
      if (!hostedZoneId && provider !== AcmeDnsProvider.Rfc2136) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: 1,
          type: "string",
          inclusive: true,
          path: ["hostedZoneId"],
          message: "String must contain at least 1 character(s)"
        });
      }
    }),
  directoryUrl: z.string().url().trim().min(1).describe(CertificateAuthorities.CONFIGURATIONS.ACME.directoryUrl),
  accountEmail: z.string().trim().min(1).describe(CertificateAuthorities.CONFIGURATIONS.ACME.accountEmail),
  eabKid: z.string().trim().max(64).optional().describe(CertificateAuthorities.CONFIGURATIONS.ACME.eabKid),
  eabHmacKey: z.string().trim().max(512).optional().describe(CertificateAuthorities.CONFIGURATIONS.ACME.eabHmacKey),
  dnsResolver: z.string().trim().ip().optional().describe(CertificateAuthorities.CONFIGURATIONS.ACME.dnsResolver)
});

export const AcmeCertificateAuthorityCredentialsSchema = z.object({
  accountKey: z.string()
});

export const AcmeCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.ACME),
  configuration: AcmeCertificateAuthorityConfigurationSchema
});

const SanitizedAcmeCertificateAuthorityConfigurationSchema = AcmeCertificateAuthorityConfigurationSchema.omit({
  eabHmacKey: true
});

export const SanitizedAcmeCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.ACME),
  configuration: SanitizedAcmeCertificateAuthorityConfigurationSchema
});

export const CreateAcmeCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema.describe(CertificateAuthorities.CONFIGURATION(CaType.ACME))
});

export const UpdateAcmeCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.ACME).extend({
  configuration: AcmeCertificateAuthorityConfigurationSchema.optional().describe(
    CertificateAuthorities.UPDATE_CONFIGURATION(CaType.ACME)
  )
});
