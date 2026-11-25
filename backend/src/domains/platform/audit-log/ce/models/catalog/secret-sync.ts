import { EventType } from "../event-type";
import type { TAuditLogSecretSync, TAuditLogSecretSyncImportBehavior } from "./shared";

export interface GetSecretSyncsEvent {
  type: EventType.GET_SECRET_SYNCS;
  metadata: {
    destination?: TAuditLogSecretSync;
    count: number;
    syncIds: string[];
  };
}

export interface GetSecretSyncEvent {
  type: EventType.GET_SECRET_SYNC;
  metadata: {
    destination: TAuditLogSecretSync;
    syncId: string;
  };
}

export interface CreateSecretSyncEvent {
  type: EventType.CREATE_SECRET_SYNC;
  metadata: TAuditLogSecretSyncCreate & { syncId: string };
}

export interface UpdateSecretSyncEvent {
  type: EventType.UPDATE_SECRET_SYNC;
  metadata: TAuditLogSecretSyncUpdate;
}

export interface DeleteSecretSyncEvent {
  type: EventType.DELETE_SECRET_SYNC;
  metadata: TAuditLogSecretSyncDelete;
}

export interface SecretSyncSyncSecretsEvent {
  type: EventType.SECRET_SYNC_SYNC_SECRETS;
  metadata: Pick<
    TAuditLogSecretSyncRaw,
    "syncOptions" | "destinationConfig" | "destination" | "syncStatus" | "connectionId" | "folderId"
  > & {
    syncId: string;
    syncMessage: string | null;
    jobId: string;
    jobRanAt: Date;
    createdSecretKeys?: string[];
    updatedSecretKeys?: string[];
    deletedSecretKeys?: string[];
  };
}

export interface SecretSyncImportSecretsEvent {
  type: EventType.SECRET_SYNC_IMPORT_SECRETS;
  metadata: Pick<
    TAuditLogSecretSyncRaw,
    "syncOptions" | "destinationConfig" | "destination" | "importStatus" | "connectionId" | "folderId"
  > & {
    syncId: string;
    importMessage: string | null;
    jobId: string;
    jobRanAt: Date;
    importBehavior: TAuditLogSecretSyncImportBehavior;
  };
}

export interface SecretSyncRemoveSecretsEvent {
  type: EventType.SECRET_SYNC_REMOVE_SECRETS;
  metadata: Pick<
    TAuditLogSecretSyncRaw,
    "syncOptions" | "destinationConfig" | "destination" | "removeStatus" | "connectionId" | "folderId"
  > & {
    syncId: string;
    removeMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

export type TAuditLogSecretSyncCreate = {
  name: string;
  connectionId: string;
  destination: TAuditLogSecretSync;
  destinationConfig: Record<string, unknown>;
  syncOptions: Record<string, unknown>;
  secretPath: string;
  environment: string;
  includeAllSubFolders?: boolean;
  isAutoSyncEnabled?: boolean;
};

export type TAuditLogSecretSyncUpdate = Partial<TAuditLogSecretSyncCreate> & {
  syncId: string;
  destination: TAuditLogSecretSync;
};

export type TAuditLogSecretSyncDelete = {
  destination: TAuditLogSecretSync;
  syncId: string;
  removeSecrets: boolean;
};

export type TAuditLogSecretSyncRaw = {
  syncOptions: unknown;
  destinationConfig: unknown;
  destination: string;
  connectionId: string;
  folderId?: string | null;
  syncStatus?: string | null;
  importStatus?: string | null;
  removeStatus?: string | null;
};

export type TSecretSyncAuditLogEvent =
  | GetSecretSyncsEvent
  | GetSecretSyncEvent
  | CreateSecretSyncEvent
  | UpdateSecretSyncEvent
  | DeleteSecretSyncEvent
  | SecretSyncSyncSecretsEvent
  | SecretSyncImportSecretsEvent
  | SecretSyncRemoveSecretsEvent;
