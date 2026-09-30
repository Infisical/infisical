import { OrgServiceActor, TProjectPermission } from "@app/lib/types";

import { AuditLogEventClass } from "./audit-log-event-classes";

export type TAuditLogEventClassSetting = {
  eventClass: AuditLogEventClass;
  isEnabled: boolean;
};

export type TProjectAuditLogEventClassSetting = TAuditLogEventClassSetting & {
  source: "organization" | "project";
};

export type TGetOrgAuditLogSettingsDTO = {
  actor: OrgServiceActor;
};

export type TUpdateOrgAuditLogSettingsDTO = {
  actor: OrgServiceActor;
  eventClasses: { eventClass: AuditLogEventClass; isEnabled: boolean }[];
};

export type TGetProjectAuditLogSettingsDTO = TProjectPermission;

export type TUpdateProjectAuditLogSettingsDTO = TProjectPermission & {
  eventClasses: { eventClass: AuditLogEventClass; isEnabled: boolean | null }[];
};

// A missing key means not set at this scope.
export type TAuditLogEventClassOverrides = Partial<Record<AuditLogEventClass, boolean>>;

export type TEffectiveAuditLogSettings = {
  org: TAuditLogEventClassOverrides;
  projects: Record<string, TAuditLogEventClassOverrides>;
  shouldUseNewPrivilegeSystem: boolean;
};
