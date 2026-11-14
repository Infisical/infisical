import type {
  TAuditLogSettings,
  TUpdateProjectAuditLogSettingsDTO
} from "@app/hooks/api/auditLogSettings/types";
import type {
  TAuditLogStream,
  TCreateAuditLogStreamDTO,
  TDeleteAuditLogStreamDTO,
  TUpdateAuditLogStreamDTO
} from "@app/hooks/api/auditLogStreams/types";
import type { TAuditLogStreamProviderOption } from "@app/hooks/api/auditLogStreams/types/provider-options";
import type { Project, UpdateAuditLogsRetentionDTO } from "@app/hooks/api/projects/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TAuditLogPlan = {
  auditLogs: boolean;
  auditLogsRetentionDays: number | null;
  auditLogStreams: boolean;
};

export type TAuditLogStorage = { storageDisabled: boolean; volumeWarning: boolean };

export type AuditLogsAdapter = {
  usePlan: (orgId: string) => V4QueryResult<TAuditLogPlan>;
  useStorage: () => V4QueryResult<TAuditLogStorage>;
  usePamProjectId: (orgId: string) => V4QueryResult<string>;
  useProjectSettings: (projectId: string) => V4QueryResult<TAuditLogSettings>;
  useUpdateProjectSettings: V4Mutation<TUpdateProjectAuditLogSettingsDTO, TAuditLogSettings>;
  useUpdateProjectRetention: V4Mutation<UpdateAuditLogsRetentionDTO, Project>;
  useStreams: () => V4QueryResult<TAuditLogStream[]>;
  useStreamOptions: () => V4QueryResult<TAuditLogStreamProviderOption[]>;
  useCreateStream: V4Mutation<TCreateAuditLogStreamDTO, TAuditLogStream>;
  useUpdateStream: V4Mutation<TUpdateAuditLogStreamDTO, TAuditLogStream>;
  useDeleteStream: V4Mutation<TDeleteAuditLogStreamDTO, TAuditLogStream>;
};
