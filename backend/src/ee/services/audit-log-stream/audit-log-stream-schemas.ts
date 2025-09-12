import { AuditLogStreamsSchema } from "@app/db/schemas";

export const BaseProviderSchema = AuditLogStreamsSchema.omit({
  encryptedCredentials: true,
  provider: true,

  // Old "archived" values
  encryptedHeadersAlgorithm: true,
  encryptedHeadersCiphertext: true,
  encryptedHeadersIV: true,
  encryptedHeadersKeyEncoding: true,
  encryptedHeadersTag: true,
  url: true
});
