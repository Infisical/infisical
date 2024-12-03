import { SshCertificateAuthoritiesSchema } from "@app/db/schemas";

export const sanitizedSshCa = SshCertificateAuthoritiesSchema.pick({
  id: true,
  orgId: true,
  friendlyName: true,
  status: true,
  keyAlgorithm: true
});
