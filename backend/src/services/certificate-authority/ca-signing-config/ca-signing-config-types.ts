import { z } from "zod";

import { CaSigningConfigType } from "./ca-signing-config-enums";

export const VenafiDestinationConfigSchema = z.object({
  applicationId: z.string().uuid(),
  issuingTemplateId: z.string().uuid(),
  validityPeriod: z.number().int().positive().optional()
});

export type TVenafiDestinationConfig = z.infer<typeof VenafiDestinationConfigSchema>;

export type TCreateCaSigningConfigDTO = {
  caId: string;
  type: CaSigningConfigType;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: TVenafiDestinationConfig;
};

export type TUpdateCaSigningConfigDTO = {
  caId: string;
  parentCaId?: string;
  appConnectionId?: string;
  destinationConfig?: TVenafiDestinationConfig;
  lastExternalCertificateId?: string;
};

export type TGetCaSigningConfigDTO = {
  caId: string;
};
