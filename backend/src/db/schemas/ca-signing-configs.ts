import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const CaSigningConfigsSchema = z.object({
  id: z.string().uuid(),
  caId: z.string().uuid(),
  type: z.string(),
  parentCaId: z.string().uuid().nullable().optional(),
  appConnectionId: z.string().uuid().nullable().optional(),
  destinationConfig: z.unknown().nullable().optional(),
  lastExternalCertificateId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TCaSigningConfigs = z.infer<typeof CaSigningConfigsSchema>;
export type TCaSigningConfigsInsert = Omit<z.input<typeof CaSigningConfigsSchema>, TImmutableDBKeys>;
export type TCaSigningConfigsUpdate = Partial<Omit<z.input<typeof CaSigningConfigsSchema>, TImmutableDBKeys>>;
