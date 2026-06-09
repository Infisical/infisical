import { z } from "zod";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { GoDaddyProductType } from "./godaddy-certificate-authority-enums";

export const GoDaddyCertificateAuthorityConfigurationSchema = z.object({
  appConnectionId: z.string().uuid().trim().describe("GoDaddy App Connection ID"),
  productType: z
    .nativeEnum(GoDaddyProductType)
    .describe("The GoDaddy DV product used for issuance (DV_SSL for a single domain)")
});

export const GoDaddyCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.GODADDY),
  configuration: GoDaddyCertificateAuthorityConfigurationSchema
});

export const CreateGoDaddyCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.GODADDY
).extend({
  configuration: GoDaddyCertificateAuthorityConfigurationSchema
});

export const UpdateGoDaddyCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.GODADDY
).extend({
  configuration: GoDaddyCertificateAuthorityConfigurationSchema.optional()
});

export const GoDaddyCertificateRequestMetadataSchema = z.object({
  godaddy: z.object({
    certificateId: z.string(),
    productType: z.string(),
    orderPlacedAt: z.string(),
    lastCheckedAt: z.string().optional(),
    lastCheckStatus: z.string().optional(),
    isRenewal: z.boolean().optional(),
    originalCertificateId: z.string().uuid().optional()
  })
});
