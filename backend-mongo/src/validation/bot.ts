import { z } from "zod";

export const GetBotByWorkspaceIdV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const SetBotActiveStateV1 = z.object({
  body: z.object({
    isActive: z.boolean(),
    botKey: z
      .object({
        nonce: z.string().trim().optional(),
        encryptedKey: z.string().trim().optional()
      })
      .optional()
  }),
  params: z.object({
    botId: z.string().trim()
  })
});
