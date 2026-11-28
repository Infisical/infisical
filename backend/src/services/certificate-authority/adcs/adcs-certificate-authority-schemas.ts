import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const ADCSCertificateAuthorityConfigurationSchema = z.object({
  appConnectionId: z.string().uuid().trim().describe("The ADCS App Connection ID."),
  caName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "The AD CS certification authority name. Optional: discovered automatically from the CA host when omitted."
    )
});

export const ADCSCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.ADCS),
  configuration: ADCSCertificateAuthorityConfigurationSchema
});

export const CreateADCSCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(CaType.ADCS).extend({
  configuration: ADCSCertificateAuthorityConfigurationSchema.describe(CertificateAuthorities.CONFIGURATION(CaType.ADCS))
});

export const UpdateADCSCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(CaType.ADCS).extend({
  configuration: ADCSCertificateAuthorityConfigurationSchema.optional().describe(
    CertificateAuthorities.UPDATE_CONFIGURATION(CaType.ADCS)
  )
});
