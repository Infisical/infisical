import { SshHostsSchema } from "@app/db/schemas";

export const sanitizedSshHost = SshHostsSchema.pick({
  id: true,
  projectId: true,
  hostname: true,
  userCertTtl: true,
  hostCertTtl: true
});
