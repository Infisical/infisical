import { z } from "zod";

export const GetSecretSnapshotV1 = z.object({
  params: z.object({
    secretSnapshotId: z.string().trim()
  })
});
