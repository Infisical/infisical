import { z } from "zod";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { CaType, InternalCaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { validateCaDateField } from "../certificate-authority-validators";

const InternalCertificateAuthorityConfigurationSchema = z
  .object({
    type: z.nativeEnum(InternalCaType),
    friendlyName: z.string().optional(),
    commonName: z.string().trim(),
    organization: z.string().trim(),
    ou: z.string().trim(),
    dn: z.string().trim(),
    parentCaId: z.string().uuid().nullish(),
    serialNumber: z.string().trim().optional(),
    activeCaCertId: z.string().uuid().optional(),
    country: z.string().trim(),
    province: z.string().trim(),
    locality: z.string().trim(),
    notBefore: validateCaDateField.optional(),
    notAfter: validateCaDateField.optional(),
    maxPathLength: z.number().min(-1),
    keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
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

export const InternalCertificateAuthoritySchema = BaseCertificateAuthoritySchema(CaType.INTERNAL).extend({
  type: z.literal(CaType.INTERNAL),
  configuration: InternalCertificateAuthorityConfigurationSchema
});

export const CreateInternalCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.INTERNAL
).extend({
  configuration: InternalCertificateAuthorityConfigurationSchema
});

export const UpdateInternalCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.INTERNAL
).extend({
  configuration: InternalCertificateAuthorityConfigurationSchema.optional()
});
