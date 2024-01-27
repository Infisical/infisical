import { z } from "zod";
import { AuthProvider } from "../ee/models";

export const GetSsoConfigv1 = z.object({
  query: z.object({ organizationId: z.string().trim() })
});

export const CreateSsoConfigv1 = z.object({
  body: z.object({
    organizationId: z.string().trim(),
    authProvider: z.nativeEnum(AuthProvider),
    isActive: z.boolean(),
    entryPoint: z.string().trim(),
    issuer: z.string().trim(),
    cert: z.string().trim()
  })
});

export const UpdateSsoConfigv1 = z.object({
  body: z.object({
    organizationId: z.string().trim(),
    authProvider: z.nativeEnum(AuthProvider).optional(),
    isActive: z.boolean().optional(),
    entryPoint: z.string().trim().optional(),
    issuer: z.string().trim().optional(),
    cert: z.string().trim().optional()
  })
});
