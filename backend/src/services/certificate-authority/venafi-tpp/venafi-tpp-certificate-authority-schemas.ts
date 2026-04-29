import { z } from "zod";

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
  configuration: VenafiTppCertificateAuthorityConfigurationSchema
});

export const UpdateVenafiTppCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.VENAFI_TPP
).extend({
  configuration: VenafiTppCertificateAuthorityConfigurationSchema.optional()
});
