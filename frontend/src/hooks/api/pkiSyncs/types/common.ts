import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { CertificateSyncStatus, PkiSyncStatus } from "../enums";

export type TChefFieldMappings = {
  certificate: string;
  privateKey: string;
  certificateChain: string;
  caCertificate: string;
};

export type RootPkiSyncOptions = {
  canImportCertificates: boolean;
  canRemoveCertificates: boolean;
  certificateNamePrefix?: string;
  certificateNameSchema?: string;
  preserveArn?: boolean;
  enableVersioning?: boolean;
  preserveItemOnRenewal?: boolean;
  updateExistingCertificates?: boolean;
  fieldMappings?: TChefFieldMappings;
};

export type TRootPkiSync = {
  id: string;
  name: string;
  description?: string | null;
  connectionId: string;
  createdAt: string;
  updatedAt: string;
  isAutoSyncEnabled: boolean;
  projectId: string;
  subscriberId?: string | null;
  syncStatus: PkiSyncStatus | null;
  lastSyncJobId: string | null;
  lastSyncedAt: string | null;
  lastSyncMessage: string | null;
  importStatus: PkiSyncStatus | null;
  lastImportJobId: string | null;
  lastImportedAt: string | null;
  lastImportMessage: string | null;
  removeStatus: PkiSyncStatus | null;
  lastRemoveJobId: string | null;
  lastRemovedAt: string | null;
  lastRemoveMessage: string | null;
  syncOptions: RootPkiSyncOptions;
  connection: {
    app: AppConnection;
    id: string;
    name: string;
  };
  subscriber?: {
    id: string;
    name: string;
  } | null;
  appConnectionName?: string;
  appConnectionApp?: string;
  hasCertificate?: boolean;
};

export type TPkiSyncCertificate = {
  id: string;
  pkiSyncId: string;
  certificateId: string;
  syncStatus?: CertificateSyncStatus | null;
  lastSyncMessage?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
  syncMetadata?: {
    isDefault?: boolean;
    [key: string]: unknown;
  } | null;
};
