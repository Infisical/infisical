import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";

import { CaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";

export const VenafiTppCertificateAuthorityConfigurationSchema = z.object({
  appConnectionId: z.string().uuid().trim().describe("The Venafi TPP App Connection ID."),
  policyDN: z
    .string()
    .trim()
    .min(1, "Policy DN is required")
    .describe("The policy folder DN in Venafi TPP (e.g., '\\\\VED\\\\Policy\\\\Certificates').")
});

export const VenafiTppCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.VENAFI_TPP),
  configuration: VenafiTppCertificateAuthorityConfigurationSchema
});

export const CreateVenafiTppCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(
  CaType.VENAFI_TPP
).extend({
  configuration: VenafiTppCertificateAuthorityConfigurationSchema.describe(
    CertificateAuthorities.CONFIGURATION(CaType.VENAFI_TPP)
  )
});

export const UpdateVenafiTppCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.VENAFI_TPP
).extend({
  configuration: VenafiTppCertificateAuthorityConfigurationSchema.optional().describe(
    CertificateAuthorities.UPDATE_CONFIGURATION(CaType.VENAFI_TPP)
  )
});
