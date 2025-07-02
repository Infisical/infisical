import { z } from "zod";

import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { ProjectType } from "@app/hooks/api/workspace/types";

export enum AuditLogDateFilterType {
  Relative = "relative",
  Absolute = "absolute"
}

export const auditLogFilterFormSchema = z.object({
  eventMetadata: z.object({}).optional(),
  project: z
    .object({ id: z.string(), name: z.string(), type: z.nativeEnum(ProjectType) })
    .optional()
    .nullable(),
  environment: z.object({ name: z.string(), slug: z.string() }).optional().nullable(),
  eventType: z.nativeEnum(EventType).array(),
  actor: z.string().optional(),
  userAgentType: z.nativeEnum(UserAgentType).optional(),
  secretPath: z.string().optional(),
  secretKey: z.string().optional(),
  page: z.coerce.number().optional(),
  perPage: z.coerce.number().optional()
});

export const auditLogDateFilterFormSchema = z
  .object({
    type: z.nativeEnum(AuditLogDateFilterType),
    relativeModeValue: z.string().optional(),
    startDate: z.date(),
    endDate: z.date()
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

export type TAuditLogFilterFormData = z.infer<typeof auditLogFilterFormSchema>;
export type TAuditLogDateFilterFormData = z.infer<typeof auditLogDateFilterFormSchema>;

export type SetValueType = (
  name: keyof TAuditLogFilterFormData,
  value: any,
  options?: {
    shouldValidate?: boolean;
    shouldDirty?: boolean;
  }
) => void;

export type Presets = {
  actorId?: string;
  eventType?: EventType[];
  actorType?: ActorType;
  startDate?: Date;
  endDate?: Date;
  eventMetadata?: Record<string, string>;
};
