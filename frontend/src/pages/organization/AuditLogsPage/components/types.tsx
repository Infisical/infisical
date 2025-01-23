import { z } from "zod";

import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";

export const auditLogFilterFormSchema = z
  .object({
    eventMetadata: z.object({}).optional(),
    project: z.object({ id: z.string(), name: z.string() }).optional().nullable(),
    eventType: z.nativeEnum(EventType).array(),
    actor: z.string().optional(),
    userAgentType: z.nativeEnum(UserAgentType),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    page: z.coerce.number().optional(),
    perPage: z.coerce.number().optional()
  })
  .superRefine((el, ctx) => {
    if (el.endDate && el.startDate && el.endDate < el.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date cannot be before start date"
      });
    }
  });

export type AuditLogFilterFormData = z.infer<typeof auditLogFilterFormSchema>;

export type SetValueType = (
  name: keyof AuditLogFilterFormData,
  value: any,
  options?: {
    shouldValidate?: boolean;
    shouldDirty?: boolean;
  }
) => void;
