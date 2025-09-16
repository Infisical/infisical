import { Job } from "bullmq";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { QueueJobs } from "@app/queue";
import { ResourceMetadataDTO } from "@app/services/resource-metadata/resource-metadata-schema";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSync } from "./pki-sync-enums";

export type TPkiSync = {
  id: string;
  name: string;
  description?: string;
  destination: PkiSync;
  isAutoSyncEnabled: boolean;
  version: number;
  destinationConfig: Record<string, unknown>;
  syncOptions: Record<string, unknown>;
  projectId: string;
  subscriberId?: string;
  connectionId: string;
  createdAt: Date;
  updatedAt: Date;
  syncStatus?: string;
  lastSyncJobId?: string;
  lastSyncMessage?: string;
  lastSyncedAt?: Date;
  importStatus?: string;
  lastImportJobId?: string;
  lastImportMessage?: string;
  lastImportedAt?: Date;
  removeStatus?: string;
  lastRemoveJobId?: string;
  lastRemoveMessage?: string;
  lastRemovedAt?: Date;
};

export type TPkiSyncListItem = TPkiSync & {
  appConnectionName: string;
  appConnectionApp: string;
};

export type TPkiSyncWithCredentials = TPkiSync & {
  connection: {
    id: string;
    name: string;
    app: string;
    credentials: Record<string, unknown>;
    orgId: string;
  };
};

export type TCertificateMap = Record<string, { cert: string; privateKey: string }>;

export type TCreatePkiSyncDTO = {
  name: string;
  description?: string;
  destination: PkiSync;
  isAutoSyncEnabled?: boolean;
  destinationConfig: Record<string, unknown>;
  syncOptions?: Record<string, unknown>;
  subscriberId?: string;
  connectionId: string;
  projectId: string;
  auditLogInfo: AuditLogInfo;
  resourceMetadata?: ResourceMetadataDTO;
};

export type TUpdatePkiSyncDTO = {
  id: string;
  projectId: string;
  name?: string;
  description?: string;
  isAutoSyncEnabled?: boolean;
  destinationConfig?: Record<string, unknown>;
  syncOptions?: Record<string, unknown>;
  subscriberId?: string;
  connectionId?: string;
  auditLogInfo: AuditLogInfo;
  resourceMetadata?: ResourceMetadataDTO;
};

export type TDeletePkiSyncDTO = {
  id: string;
  projectId: string;
  auditLogInfo: AuditLogInfo;
};

export type TListPkiSyncsByProjectId = {
  projectId: string;
};

export type TListPkiSyncsBySubscriberId = {
  subscriberId: string;
};

export type TFindPkiSyncByIdDTO = {
  id: string;
  projectId: string;
};

export type TFindPkiSyncByNameDTO = {
  name: string;
  projectId: string;
};

export type TTriggerPkiSyncSyncCertificatesByIdDTO = {
  id: string;
  projectId: string;
  auditLogInfo: AuditLogInfo;
};

export type TTriggerPkiSyncImportCertificatesByIdDTO = {
  id: string;
  projectId: string;
  auditLogInfo: AuditLogInfo;
};

export type TTriggerPkiSyncRemoveCertificatesByIdDTO = {
  id: string;
  projectId: string;
  auditLogInfo: AuditLogInfo;
};

export enum PkiSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}

export enum PkiSyncAction {
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
}

export type TPkiSyncRaw = NonNullable<Awaited<ReturnType<TPkiSyncDALFactory["findById"]>>>;

export type TQueuePkiSyncSyncCertificatesByIdDTO = {
  syncId: string;
  failedToAcquireLockCount?: number;
  auditLogInfo?: AuditLogInfo;
};

export type TQueuePkiSyncImportCertificatesByIdDTO = {
  syncId: string;
  auditLogInfo?: AuditLogInfo;
};

export type TQueuePkiSyncRemoveCertificatesByIdDTO = {
  syncId: string;
  auditLogInfo?: AuditLogInfo;
  deleteSyncOnComplete?: boolean;
};

export type TQueueSendPkiSyncActionFailedNotificationsDTO = {
  pkiSync: TPkiSyncRaw;
  auditLogInfo?: AuditLogInfo;
  action: PkiSyncAction;
};

export type TPkiSyncSyncCertificatesDTO = Job<
  TQueuePkiSyncSyncCertificatesByIdDTO,
  void,
  QueueJobs.PkiSyncSyncCertificates
>;
export type TPkiSyncImportCertificatesDTO = Job<
  TQueuePkiSyncImportCertificatesByIdDTO,
  void,
  QueueJobs.PkiSyncImportCertificates
>;
export type TPkiSyncRemoveCertificatesDTO = Job<
  TQueuePkiSyncRemoveCertificatesByIdDTO,
  void,
  QueueJobs.PkiSyncRemoveCertificates
>;

export type TSendPkiSyncFailedNotificationsJobDTO = Job<
  TQueueSendPkiSyncActionFailedNotificationsDTO,
  void,
  QueueJobs.PkiSyncSendActionFailedNotifications
>;
