import { z } from "zod";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export enum DigiCertCaPurpose {
  Ssl = "ssl",
  CodeSigning = "code_signing"
}

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
      "The DigiCert product name_id used for issuance (e.g. ssl_plus, code_signing, code_signing_ev). Fetch available products from GET /app-connections/digicert/:id/products."
    ),
  purpose: z
    .nativeEnum(DigiCertCaPurpose)
    .optional()
    .describe("Whether this CA issues SSL/TLS or code-signing certificates (defaults to ssl)"),
  verifiedContact: z
    .object({
      firstName: z.string().trim().min(1).max(128),
      lastName: z.string().trim().min(1).max(128),
      email: z.string().trim().email().max(255),
      jobTitle: z.string().trim().min(1).max(64),
      telephone: z.string().trim().min(1).max(32)
    })
    .optional()
    .describe("Contact info for the user who approves first-time code signing orders for the organization")
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
