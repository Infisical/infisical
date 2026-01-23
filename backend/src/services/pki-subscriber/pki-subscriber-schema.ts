import { z } from "zod";

import { PkiSubscribersSchema } from "@app/db/schemas/pki-subscribers";

export const sanitizedPkiSubscriber = PkiSubscribersSchema.pick({
  id: true,
  projectId: true,
  caId: true,
  name: true,
  commonName: true,
  status: true,
  subjectAlternativeNames: true,
  ttl: true,
  keyUsages: true,
  extendedKeyUsages: true,
  lastOperationStatus: true,
  lastOperationMessage: true,
  lastOperationAt: true,
  enableAutoRenewal: true,
  autoRenewalPeriodInDays: true,
  lastAutoRenewAt: true,
  properties: true
}).extend({
  supportsImmediateCertIssuance: z.boolean().optional()
});
