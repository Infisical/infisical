import { z } from "zod";

export const CreateServiceTokenV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    workspaceId: z.string().trim(),
    publicKey: z.string().trim(),
  })
});
  
export const UpdateServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    isActive: z.boolean().optional()
  })
});

export const DeleteServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
});