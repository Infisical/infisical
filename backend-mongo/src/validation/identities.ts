import { z } from "zod";
import { NO_ACCESS } from "../variables";

export const CreateIdentityV1 = z.object({
  body: z.object({
    name: z.string().trim(),
    organizationId: z.string().trim(),
    role: z.string().trim().min(1).default(NO_ACCESS)
  })
});

export const UpdateIdentityV1 = z.object({
  params: z.object({
    identityId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    role: z.string().trim().min(1).optional()
  }),
});

export const DeleteIdentityV1 = z.object({
  params: z.object({
    identityId: z.string()
  }),
});
