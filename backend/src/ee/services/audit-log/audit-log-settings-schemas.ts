import { z } from "zod";

import { AUDIT_LOG_SETTINGS } from "@app/lib/api-docs";

import { AuditLogEventClass } from "./audit-log-event-classes";

export const AuditLogSettingsResponseSchema = z.object({
  auditLogSettings: z.object({
    eventClasses: z
      .object({
        eventClass: z.nativeEnum(AuditLogEventClass).describe(AUDIT_LOG_SETTINGS.eventClass),
        isEnabled: z.boolean().describe(AUDIT_LOG_SETTINGS.isEnabled)
      })
      .array(),
    shouldUseNewPrivilegeSystem: z.boolean().describe(AUDIT_LOG_SETTINGS.shouldUseNewPrivilegeSystem)
  })
});

export const updateAuditLogSettingsBodySchema = (isEnabledDescription: string) =>
  z.object({
    eventClasses: z
      .object({
        eventClass: z.nativeEnum(AuditLogEventClass).describe(AUDIT_LOG_SETTINGS.eventClass),
        isEnabled: z.boolean().describe(isEnabledDescription)
      })
      .array()
      .min(1)
      .max(Object.values(AuditLogEventClass).length)
      .describe(AUDIT_LOG_SETTINGS.eventClasses)
  });
