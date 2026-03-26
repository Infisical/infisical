import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const DomainSsoConnectorsSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  ownerOrgId: z.string().uuid(),
  verificationStatus: z.string(),
  verificationToken: z.string(),
  verifiedAt: z.date().nullable().optional(),
  type: z.string(),
  isActive: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TDomainSsoConnectors = z.infer<typeof DomainSsoConnectorsSchema>;
export type TDomainSsoConnectorsInsert = Omit<z.input<typeof DomainSsoConnectorsSchema>, TImmutableDBKeys>;
export type TDomainSsoConnectorsUpdate = Partial<Omit<z.input<typeof DomainSsoConnectorsSchema>, TImmutableDBKeys>>;
