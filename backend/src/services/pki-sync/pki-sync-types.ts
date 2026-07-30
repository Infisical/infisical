import { Job } from "bullmq";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { QueueJobs } from "@app/queue";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TSyncMetadata } from "@app/services/certificate-sync/certificate-sync-schemas";
import { ResourceMetadataDTO } from "@app/services/resource-metadata/resource-metadata-schema";

import { TPkiSyncDALFactory } from "./pki-sync-dal";
import { PkiSync } from "./pki-sync-enums";

export type TPkiSync = {
  id: string;
  name: string;
  description?: string;
  destination: PkiSync;
  isAutoSyncEnabled: boolean;
  destinationConfig: Record<string, unknown>;
  syncOptions: Record<string, unknown>;
  projectId: string;
  applicationId?: string | null;
  applicationName?: string | null;
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
  appConnectionName: string;
  appConnectionApp: string;
  connection: {
    id: string;
    name: string;
    app: string;
    encryptedCredentials: unknown;
    orgId: string;
    projectId?: string;
    method: string;
    description?: string;
    version: number;
    gatewayId?: string;
    gatewayPoolId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    isPlatformManagedCredentials?: boolean;
  };
  subscriber?: {
    id: string;
    name: string;
  } | null;
};

export type TPkiSyncWithCredentials = TPkiSync & {
  connection: {
    id: string;
    name: string;
    app: string;
    credentials: Record<string, unknown>;
    method?: string;
    orgId: string;
    gatewayId?: string;
    gatewayPoolId?: string | null;
  };
  syncCredentials?: { exportPassword?: string };
};

export type TPkiSyncListItem = TPkiSync & {
  appConnectionName: string;
  appConnectionApp: string;
};

export type TCertificateMap = Record<
  string,
  {
    cert: string;
    privateKey: string;
    certificateChain?: string;
    caCertificate?: string;
    alternativeNames?: string[];
    certificateId?: string;
    profileId?: string | null;
    commonName?: string | null;
  }
>;

export type TPkiSyncSyncResult = {
  uploaded: number;
  removed?: number;
  failedRemovals?: number;
  skipped: number;
  details?: {
    failedUploads?: Array<{ name: string; error: string }>;
    failedRemovals?: Array<{ name: string; error: string }>;
    skippedCertificates?: Array<{ name: string; reason: string }>;
    validationErrors?: Array<{ name: string; error: string }>;
  };
};

export type TCreatePkiSyncDTO = {
  name: string;
  description?: string;
  destination: PkiSync;
  isAutoSyncEnabled?: boolean;
  destinationConfig: Record<string, unknown>;
  syncOptions?: Record<string, unknown>;
  subscriberId?: string | null;
  connectionId: string;
  projectId: string;
  applicationId?: string;
  certificateIds?: string[];
  credentials?: { exportPassword?: string };
  auditLogInfo: AuditLogInfo;
  resourceInternalMetadata?: ResourceMetadataDTO;
};

export type TUpdatePkiSyncDTO = {
  id: string;
  projectId?: string;
  applicationId?: string;
  name?: string;
  description?: string;
  isAutoSyncEnabled?: boolean;
  destinationConfig?: Record<string, unknown>;
  syncOptions?: Record<string, unknown>;
  subscriberId?: string | null;
  connectionId?: string;
  certificateIds?: string[];
  credentials?: { exportPassword?: string };
  auditLogInfo: AuditLogInfo;
  resourceInternalMetadata?: ResourceMetadataDTO;
};

export type TDeletePkiSyncDTO = {
  id: string;
  projectId?: string;
  applicationId?: string;
  auditLogInfo: AuditLogInfo;
};

export type TListPkiSyncsByProjectId = {
  projectId: string;
  certificateId?: string;
  applicationId?: string | null;
};

export type TFindPkiSyncByIdDTO = {
  id: string;
  projectId?: string;
  applicationId?: string;
};

export type TTriggerPkiSyncSyncCertificatesByIdDTO = {
  id: string;
  projectId?: string;
  auditLogInfo: AuditLogInfo;
};

export type TTriggerPkiSyncImportCertificatesByIdDTO = {
  id: string;
  projectId?: string;
  auditLogInfo: AuditLogInfo;
};

export type TTriggerPkiSyncRemoveCertificatesByIdDTO = {
  id: string;
  projectId?: string;
  auditLogInfo: AuditLogInfo;
};

export type TAddCertificatesToPkiSyncDTO = {
  pkiSyncId: string;
  certificateIds: string[];
  projectId?: string;
  auditLogInfo: AuditLogInfo;
};

export type TRemoveCertificatesFromPkiSyncDTO = {
  pkiSyncId: string;
  certificateIds: string[];
  projectId?: string;
  auditLogInfo: AuditLogInfo;
};

export type TListPkiSyncCertificatesDTO = {
  pkiSyncId: string;
  projectId?: string;
  offset?: number;
  limit?: number;
};

export type TSetCertificateAsDefaultDTO = {
  pkiSyncId: string;
  certificateId: string;
  auditLogInfo?: AuditLogInfo;
};

export type TClearDefaultCertificateDTO = {
  pkiSyncId: string;
  auditLogInfo?: AuditLogInfo;
};

export type TPkiSyncCertificate = {
  id: string;
  pkiSyncId: string;
  certificateId: string;
  syncStatus: CertificateSyncStatus;
  lastSyncMessage?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  certificateSerialNumber?: string;
  certificateCommonName?: string;
  certificateAltNames?: string;
  certificateStatus?: string;
  certificateNotBefore?: Date;
  certificateNotAfter?: Date;
  certificateRenewBeforeDays?: number;
  certificateRenewalError?: string;
  pkiSyncName?: string;
  pkiSyncDestination?: string;
  externalIdentifier?: string;
  syncMetadata?: TSyncMetadata;
};

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
  certificateIds?: string[];
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
