import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas";

// The certificates table carries bookkeeping columns the API does not expose: quotaKey and
// hasWildcard exist so the licence quota can be counted from an index. Responses build on this
// rather than omitting them per route, so a new endpoint cannot leak them.
export const SanitizedCertificateSchema = CertificatesSchema.omit({
  quotaKey: true,
  hasWildcard: true
});

export const CertificateSearchResultSchema = SanitizedCertificateSchema.extend({
  hasPrivateKey: z.boolean(),
  canRenewFromCsr: z.boolean(),
  caName: z.string().nullable().optional(),
  profileName: z.string().nullable().optional(),
  enrollmentType: z.string().nullable().optional(),
  applicationName: z.string().nullable().optional()
});
