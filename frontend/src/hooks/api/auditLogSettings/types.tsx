export enum AuditLogEventClass {
  Management = "management",
  Authentication = "authentication",
  Authorization = "authorization",
  DataAccess = "data-access"
}

export type TAuditLogEventClassSetting = {
  eventClass: AuditLogEventClass;
  isEnabled: boolean;
};

export type TProjectAuditLogEventClassSetting = TAuditLogEventClassSetting & {
  source: "organization" | "project";
};

export type TOrgAuditLogSettings = {
  eventClasses: TAuditLogEventClassSetting[];
  shouldUseNewPrivilegeSystem: boolean;
};

export type TProjectAuditLogSettings = {
  eventClasses: TProjectAuditLogEventClassSetting[];
  shouldUseNewPrivilegeSystem: boolean;
};

export type TUpdateOrgAuditLogSettingsDTO = {
  eventClasses: { eventClass: AuditLogEventClass; isEnabled: boolean }[];
};

export type TUpdateProjectAuditLogSettingsDTO = {
  projectId: string;
  eventClasses: { eventClass: AuditLogEventClass; isEnabled: boolean | null }[];
};
