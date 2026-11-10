import type {
  TAuditLogSettings,
  TUpdateProjectAuditLogSettingsDTO
} from "@app/hooks/api/auditLogSettings/types";
import type { Project, UpdateAuditLogsRetentionDTO } from "@app/hooks/api/projects/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TAuditLogPlan = { auditLogs: boolean; auditLogsRetentionDays: number | null };

export type TAuditLogStorage = { storageDisabled: boolean; volumeWarning: boolean };

export type AuditLogsAdapter = {
  usePlan: (orgId: string) => V4QueryResult<TAuditLogPlan>;
  useStorage: () => V4QueryResult<TAuditLogStorage>;
  usePamProjectId: (orgId: string) => V4QueryResult<string>;
  useProjectSettings: (projectId: string) => V4QueryResult<TAuditLogSettings>;
  useUpdateProjectSettings: V4Mutation<TUpdateProjectAuditLogSettingsDTO, TAuditLogSettings>;
  useUpdateProjectRetention: V4Mutation<UpdateAuditLogsRetentionDTO, Project>;
};
