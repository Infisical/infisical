import { z } from "zod";

export const ApplicationIdParamsSchema = z.object({ applicationId: z.string().uuid() });

export const ApplicationProfileSchema = z.object({
  applicationId: z.string().uuid(),
  profileId: z.string().uuid(),
  profileSlug: z.string(),
  profileDescription: z.string().nullable().optional(),
  estConfigId: z.string().uuid().nullable().optional(),
  apiConfigId: z.string().uuid().nullable().optional(),
  acmeConfigId: z.string().uuid().nullable().optional(),
  scepConfigId: z.string().uuid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
