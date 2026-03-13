import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const SigningOperationsSchema = z.object({
  id: z.string().uuid(),
  signerId: z.string().uuid(),
  projectId: z.string(),
  status: z.string(),
  signingAlgorithm: z.string(),
  dataHash: z.string(),
  actorType: z.string(),
  actorId: z.string().uuid(),
  actorName: z.string().nullable().optional(),
  approvalGrantId: z.string().uuid().nullable().optional(),
  clientMetadata: z.unknown().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.date()
});

export type TSigningOperations = z.infer<typeof SigningOperationsSchema>;
export type TSigningOperationsInsert = Omit<z.input<typeof SigningOperationsSchema>, TImmutableDBKeys>;
export type TSigningOperationsUpdate = Partial<Omit<z.input<typeof SigningOperationsSchema>, TImmutableDBKeys>>;
