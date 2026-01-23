import { z } from "zod";

import { SshHostsSchema } from "@app/db/schemas/ssh-hosts";

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
  allowedPrincipals: z
    .object({
      usernames: z
        .array(z.string().trim())
        .transform((usernames) => Array.from(new Set(usernames)))
        .optional(),
      groups: z
        .array(z.string().trim())
        .transform((groups) => Array.from(new Set(groups)))
        .optional()
    })
    .refine(
      (data) => {
        return (data.usernames && data.usernames.length > 0) || (data.groups && data.groups.length > 0);
      },
      {
        message: "At least one username or group must be provided",
        path: ["allowedPrincipals"]
      }
    )
});
