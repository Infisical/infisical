import { z } from "zod";

export const UploadKeyV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    key: z.object({
      encryptedKey: z.string().trim(),
      nonce: z.string().trim(),
      userId: z.string().trim()
    })
  })
});

export const GetLatestKeyV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});
