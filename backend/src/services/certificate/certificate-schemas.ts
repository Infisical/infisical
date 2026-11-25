import { z } from "zod";

import { CertificatesSchema } from "@app/db/schemas";
import { CERTIFICATES } from "@app/lib/api-docs";

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
  isRenewedByClient: z.boolean().optional().describe(CERTIFICATES.GET.isRenewedByClient),
  applicationName: z.string().nullable().optional()
});
