import RE2 from "re2";
import { z } from "zod";

import { CaSigningConfigType } from "./ca-signing-config-enums";

const RE_NO_NEWLINES = new RE2("^[^\\r\\n]+$");
const RE_DAYS_FORMAT = new RE2("^\\d+d$");

export const VenafiDestinationConfigSchema = z.object({
  applicationId: z.string().uuid(),
  issuingTemplateId: z.string().uuid(),
  validityPeriod: z.number().int().positive().optional()
});

export type TVenafiDestinationConfig = z.infer<typeof VenafiDestinationConfigSchema>;

export const AzureAdCsDestinationConfigSchema = z.object({
  template: z
    .string()
    .min(1)
    .refine((v) => RE_NO_NEWLINES.test(v), "Template name must not contain newline characters"),
  validityPeriod: z
    .string()
    .refine((v) => RE_DAYS_FORMAT.test(v), "Validity period must be in days (e.g. 365d)")
    .optional()
});

export type TAzureAdCsDestinationConfig = z.infer<typeof AzureAdCsDestinationConfigSchema>;

// Union of all external CA destination config schemas — extend here when adding new providers
export const DestinationConfigSchema = VenafiDestinationConfigSchema.or(AzureAdCsDestinationConfigSchema);

export type TCreateCaSigningConfigDTO = {
  caId: string;
  type: CaSigningConfigType;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: TVenafiDestinationConfig | TAzureAdCsDestinationConfig;
};

export type TUpdateCaSigningConfigDTO = {
  caId: string;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: TVenafiDestinationConfig | TAzureAdCsDestinationConfig;
  lastExternalCertificateId?: string;
};

export type TGetCaSigningConfigDTO = {
  caId: string;
};
