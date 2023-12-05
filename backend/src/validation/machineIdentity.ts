import { z } from "zod";
import { NO_ACCESS } from "../variables";

export const GetClientSecretsV3 = z.object({
  params: z.object({
    machineId: z.string()
  })
});

export const CreateClientSecretV3 = z.object({
  params: z.object({
    machineId: z.string()
  }),
  body: z.object({
    description: z.string().trim().default(""),
    numUsesLimit: z.number().min(0).default(0),
    ttl: z.number().min(0).default(0),
  }),
});

export const DeleteClientSecretV3 = z.object({
  params: z.object({
    machineId: z.string(),
    clientSecretId: z.string()
  })
});

export const LoginMachineIdentityV3 = z.object({
  body: z.object({
    clientId: z.string().trim(),
    clientSecret: z.string().trim()
  })
});

export const CreateMachineIdentityV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    organizationId: z.string().trim(),
    role: z.string().trim().min(1).default(NO_ACCESS),
    clientSecretTrustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }]),
    accessTokenTrustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }]),
    accessTokenTTL: z.number().int().min(1).default(7200)
  })
});
  
export const UpdateMachineIdentityV3 = z.object({
  params: z.object({
    machineId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    role: z.string().trim().min(1).optional(),
    clientSecretTrustedIps: z
      .object({
        ipAddress: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    accessTokenTrustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .optional(),
    accessTokenTTL: z.number().int().min(1).optional()
  }),
});

export const DeleteMachineIdentityV3 = z.object({
  params: z.object({
    machineId: z.string()
  }),
});