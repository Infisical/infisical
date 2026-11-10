import { AUDIT_LOG_EVENT_CLASS_DEFAULTS } from "@app/hooks/api/auditLogSettings/constants";
import { AuditLogEventClass, type TAuditLogSettings } from "@app/hooks/api/auditLogSettings/types";
import type { Project } from "@app/hooks/api/projects/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { AuditLogsAdapter } from "./contract";

const defaults = (): TAuditLogSettings => ({
  shouldUseNewPrivilegeSystem: true,
  eventClasses: Object.values(AuditLogEventClass).map((eventClass) => ({
    eventClass,
    isEnabled: AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass]
  }))
});

const settings = createFixtureStore<Record<string, TAuditLogSettings>>({});

export const auditLogsDemo: AuditLogsAdapter = {
  usePlan: () => ({
    data: { auditLogs: true, auditLogsRetentionDays: 90 },
    isPending: false,
    error: null
  }),
  useStorage: () => ({
    data: { storageDisabled: false, volumeWarning: false },
    isPending: false,
    error: null
  }),
  usePamProjectId: () => ({ data: "pam", isPending: false, error: null }),
  useProjectSettings: (projectId) => ({
    data: settings.use()[projectId] ?? defaults(),
    isPending: false,
    error: null
  }),
  useUpdateProjectSettings: fixtureMutation(({ projectId, eventClasses }) => {
    const next = { ...(settings.get()[projectId] ?? defaults()), eventClasses };
    settings.update((current) => ({ ...current, [projectId]: next }));
    return next;
  }),
  useUpdateProjectRetention: fixtureMutation(
    ({ projectId, auditLogsRetentionDays }) =>
      ({ id: projectId, auditLogsRetentionDays }) as Project
  )
};
