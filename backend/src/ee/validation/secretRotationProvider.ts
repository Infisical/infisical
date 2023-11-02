import { z } from "zod";

export const getSecretRotationProvidersV1 = z.object({
  params: z.object({
    workspaceId: z.string()
  })
});
