import { z } from "zod";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const DigiCertCertificateAuthorityConfigurationSchema = z.object({
  appConnectionId: z.string().uuid().trim().describe("DigiCert App Connection ID"),
  organizationId: z
    .number()
    .int()
    .positive()
    .describe("CertCentral Organization ID that will be listed on issued certificates"),
  productNameId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The DigiCert product name_id used for issuance (e.g. ssl_plus, ssl_ev_plus). Fetch available products from GET /app-connections/digicert/:id/products."
    )
});

export const DigiCertCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.DIGICERT),
  configuration: DigiCertCertificateAuthorityConfigurationSchema
});

export const CreateDigiCertCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.DIGICERT
).extend({
  configuration: DigiCertCertificateAuthorityConfigurationSchema
});

export const UpdateDigiCertCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.DIGICERT
).extend({
  configuration: DigiCertCertificateAuthorityConfigurationSchema.optional()
});

export const DigiCertCertificateRequestMetadataSchema = z.object({
  digicert: z.object({
    orderId: z.number().int(),
    certificateId: z.number().int().optional(),
    productNameId: z.string(),
    organizationId: z.number().int(),
    orderPlacedAt: z.string(),
    lastCheckedAt: z.string().optional(),
    lastCheckStatus: z.string().optional(),
    isRenewal: z.boolean().optional(),
    originalCertificateId: z.string().uuid().optional()
  })
});
