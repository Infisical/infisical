import { z } from "zod";

import { SshHostsSchema } from "@app/db/schemas";

export const sanitizedSshHost = SshHostsSchema.pick({
  id: true,
  projectId: true,
  hostname: true,
  userCertTtl: true,
  hostCertTtl: true,
  userSshCaId: true,
  hostSshCaId: true
});

export const loginMappingSchema = z.object({
  loginUser: z.string(),
  allowedPrincipals: z.object({
    usernames: z.array(z.string())
  })
});
