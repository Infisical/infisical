import { SshCertificatesSchema } from "@app/db/schemas/ssh-certificates";

export const sanitizedSshCertificate = SshCertificatesSchema.pick({
  id: true,
  sshCaId: true,
  sshCertificateTemplateId: true,
  serialNumber: true,
  certType: true,
  principals: true,
  keyId: true,
  notBefore: true,
  notAfter: true
});
