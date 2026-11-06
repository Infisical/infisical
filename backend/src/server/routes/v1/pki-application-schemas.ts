import { z } from "zod";

export const ApplicationIdParamsSchema = z.object({ applicationId: z.string().guid() });

export const ApplicationProfileSchema = z.object({
  applicationId: z.string().guid(),
  profileId: z.string().guid(),
  profileSlug: z.string(),
  profileDescription: z.string().nullable().optional(),
  estConfigId: z.string().guid().nullable().optional(),
  apiConfigId: z.string().guid().nullable().optional(),
  acmeConfigId: z.string().guid().nullable().optional(),
  scepConfigId: z.string().guid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
