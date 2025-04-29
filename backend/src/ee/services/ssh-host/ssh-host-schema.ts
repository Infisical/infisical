import { z } from "zod";

import { SshHostsSchema } from "@app/db/schemas";

export const sanitizedSshHost = SshHostsSchema.pick({
  id: true,
  projectId: true,
  hostname: true,
  alias: true,
  userCertTtl: true,
  hostCertTtl: true,
  userSshCaId: true,
  hostSshCaId: true
});

export const loginMappingSchema = z.object({
  loginUser: z.string().trim(),
  allowedPrincipals: z.object({
    usernames: z.array(z.string().trim()).transform((usernames) => Array.from(new Set(usernames)))
  })
});
