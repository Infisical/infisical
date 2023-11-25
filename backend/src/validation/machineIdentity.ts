import { z } from "zod";
import { MEMBER } from "../variables";

export const RefreshTokenV3 = z.object({
  body: z.object({
    refreshToken: z.string().trim()
  })
});

export const CreateMachineIdentityV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    organizationId: z.string().trim(),
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
    isRefreshTokenRotationEnabled: z.boolean().default(false)
  })
});
  
export const UpdateMachineIdentityV3 = z.object({
  params: z.object({
    machineId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
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

export const DeleteMachineIdentityV3 = z.object({
  params: z.object({
    machineId: z.string()
  }),
});