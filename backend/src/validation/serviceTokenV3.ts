import { z } from "zod";

export const CreateServiceTokenV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    workspaceId: z.string().trim(),
    publicKey: z.string().trim(),
    scopes: z
      .object({
        permission: z.enum(["read", "readWrite"]),
        environment: z.string().trim(),
        secretPath: z.string().trim()
      })
      .array()
      .min(1),
    expiresIn: z.number().optional(),
    encryptedKey: z.string().trim(),
    nonce: z.string().trim()
  })
});
  
export const UpdateServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    scopes: z
      .object({
        permission: z.enum(["read", "readWrite"]),
        environment: z.string().trim(),
        secretPath: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    expiresIn: z.number().optional()
  }),
});

export const DeleteServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
});