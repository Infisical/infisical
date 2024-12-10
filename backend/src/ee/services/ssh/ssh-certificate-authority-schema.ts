import { SshCertificateAuthoritiesSchema } from "@app/db/schemas";

export const sanitizedSshCa = SshCertificateAuthoritiesSchema.pick({
  id: true,
  projectId: true,
  friendlyName: true,
  status: true,
  keyAlgorithm: true
});
