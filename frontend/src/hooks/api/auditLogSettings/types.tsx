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

export type TAuditLogSettings = {
  eventClasses: TAuditLogEventClassSetting[];
  shouldUseNewPrivilegeSystem: boolean;
};

export type TUpdateOrgAuditLogSettingsDTO = {
  eventClasses: TAuditLogEventClassSetting[];
};

export type TUpdateProjectAuditLogSettingsDTO = {
  projectId: string;
  eventClasses: TAuditLogEventClassSetting[];
};
