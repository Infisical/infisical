import { CertificatesSchema } from "@app/db/schemas";

// The certificates table carries bookkeeping columns the API does not expose: orderId groups a
// renewal chain, and quotaKey / hasWildcard exist so the licence quota can be counted from an index.
// Responses build on this rather than omitting them per route, so a new endpoint cannot leak them.
export const SanitizedCertificateSchema = CertificatesSchema.omit({
  orderId: true,
  quotaKey: true,
  hasWildcard: true
});
