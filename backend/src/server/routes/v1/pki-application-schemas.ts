import { z } from "zod";

import { MicrosoftAutoenrollmentChannelBindingStatus } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
import { MICROSOFT_AUTOENROLLMENT } from "@app/lib/api-docs";

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
  createdAt: z.date(),
  updatedAt: z.date()
});

export const MicrosoftAutoenrollmentStateSchema = z.object({
  id: z.string().uuid().describe(MICROSOFT_AUTOENROLLMENT.STATE.id),
  policyUrl: z.string().describe(MICROSOFT_AUTOENROLLMENT.STATE.policyUrl),
  policyId: z.string().describe(MICROSOFT_AUTOENROLLMENT.STATE.policyId),
  templateName: z.string().describe(MICROSOFT_AUTOENROLLMENT.STATE.templateName),
  templateOid: z.string().describe(MICROSOFT_AUTOENROLLMENT.STATE.templateOid),
  allowedGroups: z
    .array(z.object({ sid: z.string(), name: z.string() }))
    .describe(MICROSOFT_AUTOENROLLMENT.STATE.allowedGroups),
  renewBeforeDays: z.number().int().describe(MICROSOFT_AUTOENROLLMENT.STATE.renewBeforeDays),
  effectiveRenewBeforeSeconds: z
    .number()
    .int()
    .nullable()
    .describe(MICROSOFT_AUTOENROLLMENT.STATE.effectiveRenewBeforeSeconds),
  servicePrincipalName: z.string().describe(MICROSOFT_AUTOENROLLMENT.STATE.servicePrincipalName),
  keyVersion: z.number().int().describe(MICROSOFT_AUTOENROLLMENT.STATE.keyVersion),
  connectionId: z.string().uuid().describe(MICROSOFT_AUTOENROLLMENT.STATE.connectionId),
  allowAnyChannelBinding: z.boolean().describe(MICROSOFT_AUTOENROLLMENT.STATE.allowAnyChannelBinding),
  channelBinding: z
    .object({
      status: z.nativeEnum(MicrosoftAutoenrollmentChannelBindingStatus),
      reason: z.string().nullable()
    })
    .describe(MICROSOFT_AUTOENROLLMENT.STATE.channelBinding)
});
