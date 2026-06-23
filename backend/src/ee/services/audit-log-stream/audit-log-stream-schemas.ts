import { z } from "zod";

import { AuditLogStreamsSchema } from "@app/db/schemas";

import { AuditLogStreamProduct } from "./audit-log-stream-enums";

// Scopes which audit logs a stream receives. An absent/empty `products` list means "stream every
// product" — the same as a NULL `filters` column. Modeled as an object so new filter dimensions
// (event types, actors, environments, ...) can be added later without a schema migration.
export const AuditLogStreamFiltersSchema = z.object({
  products: z.nativeEnum(AuditLogStreamProduct).array().optional()
});

export type TAuditLogStreamFilters = z.infer<typeof AuditLogStreamFiltersSchema>;

export const BaseProviderSchema = AuditLogStreamsSchema.omit({
  encryptedCredentials: true,
  provider: true,

  // Re-added below with a typed schema (the generated column type is z.unknown()).
  filters: true,

  // Old "archived" values
  encryptedHeadersAlgorithm: true,
  encryptedHeadersCiphertext: true,
  encryptedHeadersIV: true,
  encryptedHeadersKeyEncoding: true,
  encryptedHeadersTag: true,
  url: true
}).extend({
  filters: AuditLogStreamFiltersSchema.nullable().optional()
});
