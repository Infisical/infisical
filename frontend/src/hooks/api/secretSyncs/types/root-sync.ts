import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSyncInitialSyncBehavior, SecretSyncStatus } from "@app/hooks/api/secretSyncs";

export type RootSyncOptions = {
  initialSyncBehavior: SecretSyncInitialSyncBehavior;
  disableSecretDeletion?: boolean;
  keySchema?: string;
};

export type TRootSecretSync = {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  folderId: string | null;
  connectionId: string;
  createdAt: string;
  updatedAt: string;
  isAutoSyncEnabled: boolean;
  projectId: string;
  syncStatus: SecretSyncStatus | null;
  lastSyncJobId: string | null;
  lastSyncedAt: Date | null;
  lastSyncMessage: string | null;
  importStatus: SecretSyncStatus | null;
  lastImportJobId: string | null;
  lastImportedAt: Date | null;
  lastImportMessage: string | null;
  removeStatus: SecretSyncStatus | null;
  lastRemoveJobId: string | null;
  lastRemovedAt: Date | null;
  lastRemoveMessage: string | null;
  syncOptions: RootSyncOptions;
  connection: {
    app: AppConnection;
    id: string;
    name: string;
  };
  environment: {
    id: string;
    name: string;
    slug: string;
  } | null;
  folder: {
    id: string;
    path: string;
  } | null;
};
