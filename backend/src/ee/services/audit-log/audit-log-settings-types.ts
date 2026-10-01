import { OrgServiceActor, TProjectPermission } from "@app/lib/types";

import { AuditLogEventClass } from "./audit-log-event-classes";

export type TAuditLogEventClassSetting = {
  eventClass: AuditLogEventClass;
  isEnabled: boolean;
};

export type TGetOrgAuditLogSettingsDTO = {
  actor: OrgServiceActor;
};

export type TUpdateOrgAuditLogSettingsDTO = {
  actor: OrgServiceActor;
  eventClasses: TAuditLogEventClassSetting[];
};

export type TGetProjectAuditLogSettingsDTO = TProjectPermission;

export type TUpdateProjectAuditLogSettingsDTO = TProjectPermission & {
  eventClasses: TAuditLogEventClassSetting[];
};

// Missing key = not set at this scope.
export type TAuditLogEventClassOverrides = Partial<Record<AuditLogEventClass, boolean>>;

export type TEffectiveAuditLogSettings = {
  org: TAuditLogEventClassOverrides;
  projects: Record<string, TAuditLogEventClassOverrides>;
  shouldUseNewPrivilegeSystem: boolean;
};
