import { AuditLogEventClass } from "./types";

export const auditLogEventClassToNameMap: Record<AuditLogEventClass, string> = {
  [AuditLogEventClass.Management]: "Management",
  [AuditLogEventClass.Authentication]: "Authentication",
  [AuditLogEventClass.DataAccess]: "Data access",
  [AuditLogEventClass.Authorization]: "Authorization"
};

export const auditLogEventClassToDescriptionMap: Record<AuditLogEventClass, string> = {
  [AuditLogEventClass.Management]:
    "Creates, updates, deletes, membership, roles, policies, background jobs, privileged session start and end.",
  [AuditLogEventClass.Authentication]:
    "Logins, failed logins, org selection, machine identity auth, gateway and relay connects.",
  [AuditLogEventClass.DataAccess]:
    "Reads and lists, plus crypto use operations that hand back or operate on secret material.",
  [AuditLogEventClass.Authorization]:
    "Permission denials. Repeats by the same actor within a minute are collapsed into one event."
};

// Mirrors the backend defaults.
export const AUDIT_LOG_EVENT_CLASS_DEFAULTS: Record<AuditLogEventClass, boolean> = {
  [AuditLogEventClass.Management]: true,
  [AuditLogEventClass.Authentication]: true,
  [AuditLogEventClass.DataAccess]: true,
  [AuditLogEventClass.Authorization]: false
};

// Display order.
export const AUDIT_LOG_EVENT_CLASSES = [
  AuditLogEventClass.Management,
  AuditLogEventClass.DataAccess,
  AuditLogEventClass.Authentication,
  AuditLogEventClass.Authorization
] as const;

export const ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES: readonly AuditLogEventClass[] = [
  AuditLogEventClass.Management,
  AuditLogEventClass.DataAccess
];

// Updates are full replacements, so send all of these.
export const CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES = [
  AuditLogEventClass.Authentication,
  AuditLogEventClass.Authorization
] as const;
