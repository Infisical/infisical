import { TActorContext } from "@app/domains/lib/actor-context";
import { TActorInput } from "@app/lib/types";

import { AuditLogEventClass } from "./audit-log-event-classes";

export type TAuditLogEventClassSetting = {
  eventClass: AuditLogEventClass;
  isEnabled: boolean;
};

export type TGetOrgAuditLogSettingsDTO = {
  actor: TActorContext;
};

export type TUpdateOrgAuditLogSettingsDTO = {
  actor: TActorContext;
  eventClasses: TAuditLogEventClassSetting[];
};

export type TGetProjectAuditLogSettingsDTO = { projectId: string } & TActorInput;

export type TUpdateProjectAuditLogSettingsDTO = TActorInput & {
  projectId: string;
  eventClasses: TAuditLogEventClassSetting[];
};

// Missing key = not set at this scope.
export type TAuditLogEventClassOverrides = Partial<Record<AuditLogEventClass, boolean>>;

export type TCachedOrgAuditLogSettings = {
  overrides: TAuditLogEventClassOverrides;
  shouldUseNewPrivilegeSystem: boolean;
};

export type TEffectiveAuditLogSettings = {
  org: TAuditLogEventClassOverrides;
  project?: TAuditLogEventClassOverrides;
  shouldUseNewPrivilegeSystem: boolean;
};
