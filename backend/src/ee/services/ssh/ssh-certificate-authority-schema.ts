import { SshCertificateAuthoritiesSchema } from "@app/db/schemas/ssh-certificate-authorities";

export const sanitizedSshCa = SshCertificateAuthoritiesSchema.pick({
  id: true,
  projectId: true,
  friendlyName: true,
  status: true,
  keyAlgorithm: true,
  keySource: true
});
