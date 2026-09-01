import RE2 from "re2";
import { z } from "zod";

import { CaSigningConfigType } from "./ca-signing-config-enums";

const RE_NO_NEWLINES = new RE2("^[^\\r\\n]+$");

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
  validityPeriod: z.number().int().positive().optional()
});

export type TAzureAdCsDestinationConfig = z.infer<typeof AzureAdCsDestinationConfigSchema>;

export const AdcsDestinationConfigSchema = z.object({
  template: z
    .string()
    .min(1)
    .refine((v) => RE_NO_NEWLINES.test(v), "Template name must not contain newline characters"),
  caName: z
    .string()
    .min(1)
    .refine((v) => RE_NO_NEWLINES.test(v), "CA name must not contain newline characters")
    .optional()
});

export type TAdcsDestinationConfig = z.infer<typeof AdcsDestinationConfigSchema>;

// Union of all external CA destination config schemas — extend here when adding new providers.
export const DestinationConfigSchema = z.union([
  VenafiDestinationConfigSchema.strict(),
  AzureAdCsDestinationConfigSchema.strict(),
  AdcsDestinationConfigSchema.strict()
]);

export type TCreateCaSigningConfigDTO = {
  caId: string;
  type: CaSigningConfigType;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: TVenafiDestinationConfig | TAzureAdCsDestinationConfig | TAdcsDestinationConfig;
};

export type TUpdateCaSigningConfigDTO = {
  caId: string;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: TVenafiDestinationConfig | TAzureAdCsDestinationConfig | TAdcsDestinationConfig;
  lastExternalCertificateId?: string;
};

export type TGetCaSigningConfigDTO = {
  caId: string;
};
