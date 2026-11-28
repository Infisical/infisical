import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";

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
  appConnectionId: z.string().uuid().trim().describe("The ID of the DigiCert app connection to issue through."),
  organizationId: z
    .number()
    .int()
    .positive()
    .describe("The numeric ID of the DigiCert CertCentral organization listed on issued certificates."),
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
      firstName: z.string().trim().min(1).max(128).describe("The contact's first name, 1 to 128 characters."),
      lastName: z.string().trim().min(1).max(128).describe("The contact's last name, 1 to 128 characters."),
      email: z.string().trim().email().max(255).describe("The contact's email address, up to 255 characters."),
      jobTitle: z.string().trim().min(1).max(64).describe("The contact's job title, 1 to 64 characters."),
      telephone: z.string().trim().min(1).max(32).describe("The contact's telephone number, 1 to 32 characters.")
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
  configuration: DigiCertCertificateAuthorityConfigurationSchema.describe(
    CertificateAuthorities.CONFIGURATION(CaType.DIGICERT)
  )
});

export const UpdateDigiCertCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.DIGICERT
).extend({
  configuration: DigiCertCertificateAuthorityConfigurationSchema.optional().describe(
    CertificateAuthorities.UPDATE_CONFIGURATION(CaType.DIGICERT)
  )
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
    originalCertificateId: z.string().uuid().optional(),
    previousCertificateId: z.number().int().optional()
  })
});
