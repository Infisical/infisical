import { z } from "zod";

export const createSecretRotationV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    secretPath: z.string().trim(),
    environment: z.string().trim(),
    interval: z.number().min(1),
    provider: z.string().trim(),
    customProvider: z.string().trim().optional(),
    inputs: z.record(z.unknown()),
    outputs: z.record(z.string())
  })
});

export const restartSecretRotationV1 = z.object({
  body: z.object({
    id: z.string().trim()
  })
});

export const getSecretRotationV1 = z.object({
  query: z.object({
    workspaceId: z.string().trim()
  })
});

export const removeSecretRotationV1 = z.object({
  params: z.object({
    id: z.string().trim()
  })
});
