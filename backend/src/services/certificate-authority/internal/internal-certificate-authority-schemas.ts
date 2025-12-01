import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { CaType, InternalCaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { validateCaDateField } from "../certificate-authority-validators";

export const InternalCertificateAuthorityConfigurationSchema = z
  .object({
    type: z.nativeEnum(InternalCaType).describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.type),
    friendlyName: z.string().optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.friendlyName),
    commonName: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.commonName),
    organization: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.organization),
    ou: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.ou),
    country: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.country),
    province: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.province),
    locality: z.string().trim().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.locality),
    notBefore: validateCaDateField.optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.notBefore),
    notAfter: validateCaDateField.optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.notAfter),
    maxPathLength: z.number().min(-1).nullish().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.maxPathLength),
    keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.keyAlgorithm),
    dn: z.string().trim().nullish(),
    parentCaId: z.string().uuid().nullish(),
    serialNumber: z.string().trim().nullish(),
    activeCaCertId: z.string().uuid().nullish()
  })
  .refine(
    (data) => {
      // Check that at least one of the specified fields is non-empty
      return [data.commonName, data.organization, data.ou, data.country, data.province, data.locality].some(
        (field) => field !== ""
      );
    },
    {
      message:
        "At least one of the fields commonName, organization, ou, country, province, or locality must be non-empty",
      path: []
    }
  );

export const InternalCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.INTERNAL),
  configuration: InternalCertificateAuthorityConfigurationSchema
});

export const CreateInternalCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.INTERNAL
).extend({
  configuration: InternalCertificateAuthorityConfigurationSchema
});

export const UpdateInternalCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.INTERNAL);
