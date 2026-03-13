import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const SignersSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.string().default("active"),
  certificateId: z.string().uuid(),
  approvalPolicyId: z.string().uuid(),
  lastSignedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TSigners = z.infer<typeof SignersSchema>;
export type TSignersInsert = Omit<z.input<typeof SignersSchema>, TImmutableDBKeys>;
export type TSignersUpdate = Partial<Omit<z.input<typeof SignersSchema>, TImmutableDBKeys>>;
