import { z } from "zod";
import { MEMBER } from "../variables";

export const RefreshTokenV3 = z.object({
  body: z.object({
    refresh_token: z.string().trim()
  })
});

export const CreateServiceTokenV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    workspaceId: z.string().trim(),
    publicKey: z.string().trim(),
    role: z.string().trim().min(1).default(MEMBER),
    trustedIps: z // TODO: provide default
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }]),
    expiresIn: z.number().optional(),
    accessTokenTTL: z.number().int().min(1),
    encryptedKey: z.string().trim(),
    nonce: z.string().trim(),
    isRefreshTokenRotationEnabled: z.boolean().default(false)
  })
});
  
export const UpdateServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    role: z.string().trim().min(1).optional(),
    trustedIps: z
      .object({
        ipAddress: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    expiresIn: z.number().optional(),
    accessTokenTTL: z.number().int().min(1).optional(),
    isRefreshTokenRotationEnabled: z.boolean().optional()
  }),
});

export const DeleteServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
});