import * as yup from "yup";

import { EventType, UserAgentType } from "~/hooks/api/auditLogs/enums";

export const auditLogFilterFormSchema = yup.object({
    eventType: yup.string()
        .oneOf(Object.values(EventType), "Invalid event type"),
    actor: yup.string(),
    userAgentType: yup.string()
        .oneOf(Object.values(UserAgentType), "Invalid user agent type"),
}).required();

export type AuditLogFilterFormData = yup.InferType<typeof auditLogFilterFormSchema>;