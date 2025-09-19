import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSyncStatus } from "../enums";

export type RootPkiSyncOptions = {
  canImportCertificates: boolean;
  canRemoveCertificates: boolean;
  certificateNamePrefix?: string;
  certificateNameSchema?: string;
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
};
