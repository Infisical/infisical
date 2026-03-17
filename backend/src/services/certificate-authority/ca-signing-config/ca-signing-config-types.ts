import { z } from "zod";

import { CaSigningConfigType } from "./ca-signing-config-enums";

export const VenafiDestinationConfigSchema = z.object({
  applicationId: z.string().uuid(),
  issuingTemplateId: z.string().uuid(),
  validityPeriod: z.number().int().positive().optional()
});

export type TVenafiDestinationConfig = z.infer<typeof VenafiDestinationConfigSchema>;

export const AzureAdCsDestinationConfigSchema = z.object({
  template: z.string().min(1),
  validityPeriod: z.string().optional()
});

export type TAzureAdCsDestinationConfig = z.infer<typeof AzureAdCsDestinationConfigSchema>;

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
