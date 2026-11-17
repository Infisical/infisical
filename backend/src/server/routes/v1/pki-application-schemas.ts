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
  microsoftAutoenrollmentConfigId: z.string().uuid().nullable().optional(),
  microsoftAutoenrollmentKeytabMismatch: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const MicrosoftAutoenrollmentStateSchema = z.object({
  policyUrl: z.string(),
  policyId: z.string(),
  templateName: z.string(),
  templateOid: z.string(),
  allowedGroups: z.array(z.object({ sid: z.string(), name: z.string().nullable() })),
  renewBeforeDays: z.number().int(),
  servicePrincipalName: z.string(),
  keyVersion: z.number().int(),
  connectionId: z.string().uuid(),
  keytabMismatch: z
    .object({
      servicePrincipalName: z.string(),
      firstSeenAt: z.date(),
      requestCount: z.number().int()
    })
    .nullable()
});
