import { z } from "zod";
import { NO_ACCESS } from "../variables";

export const GetClientSecretsV1 = z.object({
  params: z.object({
    machineId: z.string()
  })
});

export const CreateClientSecretV1 = z.object({
  params: z.object({
    machineId: z.string()
  }),
  body: z.object({
    description: z.string().trim().default(""),
    numUsesLimit: z.number().min(0).default(0),
    ttl: z.number().min(0).default(0),
  }),
});

export const DeleteClientSecretV1 = z.object({
  params: z.object({
    machineId: z.string(),
    clientSecretId: z.string()
  })
});

export const LoginMachineIdentityV1 = z.object({
  body: z.object({
    clientId: z.string().trim(),
    clientSecret: z.string().trim()
  })
});

export const RenewAccessTokenV1 = z.object({
  body: z.object({
    accessToken: z.string().trim()
  })
});

export const CreateMachineIdentityV1 = z.object({
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
    accessTokenTTL: z.number().int().min(0).default(7200),
    accessTokenMaxTTL: z.number().int().min(0).default(7200),
    accessTokenNumUsesLimit: z.number().int().min(0).default(0)
  })
  .refine(data => data.accessTokenTTL <= data.accessTokenMaxTTL, {
    message: "accessTokenTTL cannot be greater than accessTokenMaxTTL",
    path: ["accessTokenTTL"],
  })
});
  
export const UpdateMachineIdentityV1 = z.object({
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
    accessTokenTTL: z.number().int().min(0).optional(),
    accessTokenNumUsesLimit: z.number().int().min(0).optional()
  }),
});

export const DeleteMachineIdentityV1 = z.object({
  params: z.object({
    machineId: z.string()
  }),
});