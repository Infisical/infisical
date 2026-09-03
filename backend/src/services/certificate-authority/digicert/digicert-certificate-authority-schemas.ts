import { z } from "zod";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { CaDnsProvider } from "../dns-providers/ca-dns-provider-enums";

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
    .describe("Contact info for the user who approves first-time code signing orders for the organization"),
  dnsAppConnectionId: z
    .string()
    .uuid()
    .trim()
    .optional()
    .describe(
      "Optional. The ID of the App Connection Infisical uses to automate DigiCert's DNS TXT domain control validation (DCV). When set, Infisical creates the DCV TXT record DigiCert returns for each ordered domain and cleans it up once the order reaches a final state. When omitted, the domain must already be validated in CertCentral, or you must complete DCV manually before the order's 24h validation window expires."
    ),
  dnsProviderConfig: z
    .object({
      provider: z.nativeEnum(CaDnsProvider).describe("The DNS provider used to automate DigiCert's DCV TXT record."),
      hostedZoneId: z
        .string()
        .trim()
        .min(1)
        .describe("The hosted zone ID/name in the DNS provider to create the DCV TXT record in.")
    })
    .optional()
    .describe("Required together with dnsAppConnectionId to automate DigiCert DCV via DNS TXT record.")
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
    originalCertificateId: z.string().uuid().optional(),
    // Snapshot of the DNS automation used at order time so cleanup targets the
    // same provider/connection even if the CA's configuration changes later.
    dcv: z
      .object({
        dnsAppConnectionId: z.string().uuid(),
        provider: z.nativeEnum(CaDnsProvider),
        hostedZoneId: z.string(),
        records: z.array(z.object({ domain: z.string(), value: z.string() })),
        cleanedUpAt: z.string().optional()
      })
      .optional()
  })
});
