import * as yup from "yup";

import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";

export const auditLogFilterFormSchema = yup.object({
    eventType: yup.string()
        .oneOf(Object.values(EventType), "Invalid event type"),
    actor: yup.string(),
    userAgentType: yup.string()
        .oneOf(Object.values(UserAgentType), "Invalid user agent type"),
    startDate: yup.date(),
    endDate: yup.date().min(yup.ref("startDate"), "End date cannot be before start date"),
    page: yup.number(),
    perPage: yup.number()
}).required();

export type AuditLogFilterFormData = yup.InferType<typeof auditLogFilterFormSchema>;

export type SetValueType = (
  name: keyof AuditLogFilterFormData, 
  value: any, 
  options?: {
    shouldValidate?: boolean,
    shouldDirty?: boolean
  }
) => void;