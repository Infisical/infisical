import { EventType } from "../event-type";
import type {
  TAuditLogSecretScanningDataSource,
  TAuditLogSecretScanningFindingStatus,
  TAuditLogSecretScanningScanStatus,
  TAuditLogSecretScanningScanType
} from "./shared";

export interface SecretScanningDataSourceListEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_LIST;
  metadata: {
    type?: TAuditLogSecretScanningDataSource;
    count: number;
    dataSourceIds: string[];
  };
}

export interface SecretScanningDataSourceGetEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_GET;
  metadata: {
    type: TAuditLogSecretScanningDataSource;
    dataSourceId: string;
  };
}

export interface SecretScanningDataSourceCreateEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_CREATE;
  metadata: Omit<TAuditLogSecretScanningDataSourceCreate, "alerts"> & {
    dataSourceId: string;
    alerts?: { eventType: string; channelTypes: string[] }[];
  };
}

export interface SecretScanningDataSourceUpdateEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_UPDATE;
  metadata: TAuditLogSecretScanningDataSourceUpdate;
}

export interface SecretScanningDataSourceDeleteEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_DELETE;
  metadata: TAuditLogSecretScanningDataSourceDelete;
}

export interface SecretScanningDataSourceTriggerScanEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_TRIGGER_SCAN;
  metadata: TAuditLogSecretScanningDataSourceTrigger;
}

export interface SecretScanningDataSourceScanEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN;
  metadata: {
    scanId: string;
    resourceId: string;
    resourceName: string;
    dataSourceId: string;
    dataSourceName: string;
    dataSourceType: string;
    scanStatus: TAuditLogSecretScanningScanStatus;
    scanType: TAuditLogSecretScanningScanType;
    numberOfSecretsDetected?: number;
  };
}

export interface SecretScanningResourceListEvent {
  type: EventType.SECRET_SCANNING_RESOURCE_LIST;
  metadata: {
    type: TAuditLogSecretScanningDataSource;
    dataSourceId: string;
    resourceIds: string[];
    count: number;
  };
}

export interface SecretScanningResourceAddEvent {
  type: EventType.SECRET_SCANNING_RESOURCE_ADD;
  metadata: {
    type: TAuditLogSecretScanningDataSource;
    dataSourceId: string;
    dataSourceName: string;
    resources: { resourceId: string; resourceName: string }[];
  };
}

export interface SecretScanningResourceRemoveEvent {
  type: EventType.SECRET_SCANNING_RESOURCE_REMOVE;
  metadata: {
    type: TAuditLogSecretScanningDataSource;
    dataSourceId: string;
    dataSourceName: string;
    resourceId: string;
    resourceName: string;
  };
}

export interface SecretScanningScanListEvent {
  type: EventType.SECRET_SCANNING_SCAN_LIST;
  metadata: {
    type: TAuditLogSecretScanningDataSource;
    dataSourceId: string;
    count: number;
  };
}

export interface SecretScanningFindingListEvent {
  type: EventType.SECRET_SCANNING_FINDING_LIST;
  metadata: {
    findingIds: string[];
    count: number;
  };
}

export interface SecretScanningFindingLocationListEvent {
  type: EventType.SECRET_SCANNING_FINDING_LOCATION_LIST;
  metadata: {
    findingId: string;
    findingRule: string;
    resourceId: string;
    resourceName: string;
    count: number;
  };
}

export interface SecretScanningFindingUpdateEvent {
  type: EventType.SECRET_SCANNING_FINDING_UPDATE;
  metadata: TAuditLogSecretScanningFindingUpdate & { findingRule: string; resourceId: string; resourceName: string };
}

export interface SecretScanningConfigUpdateEvent {
  type: EventType.SECRET_SCANNING_CONFIG_UPDATE;
  metadata: {
    content: string | null;
  };
}

export interface SecretScanningConfigReadEvent {
  type: EventType.SECRET_SCANNING_CONFIG_GET;
  metadata?: Record<string, never>; // not needed, based off projectId
}

export type TAuditLogSecretScanningDataSourceCreate = {
  name: string;
  description?: string | null;
  connectionId?: string;
  type: TAuditLogSecretScanningDataSource;
  isAutoScanEnabled?: boolean;
  isHistoricalScanEnabled?: boolean;
  isScanNewCommitsEnabled?: boolean;
  isDiscoveryEnabled?: boolean;
  config: Record<string, unknown>;
};

export type TAuditLogSecretScanningDataSourceUpdate = Partial<
  Omit<TAuditLogSecretScanningDataSourceCreate, "connectionId">
> & {
  dataSourceId: string;
  type: TAuditLogSecretScanningDataSource;
};

export type TAuditLogSecretScanningDataSourceDelete = {
  type: TAuditLogSecretScanningDataSource;
  dataSourceId: string;
};

export type TAuditLogSecretScanningDataSourceTrigger = {
  type: TAuditLogSecretScanningDataSource;
  dataSourceId: string;
  resourceId?: string;
};

export type TAuditLogSecretScanningFindingUpdate = {
  status?: TAuditLogSecretScanningFindingStatus;
  triageComment?: string | null;
  findingId: string;
};

export type TSecretScanningAuditLogEvent =
  | SecretScanningDataSourceListEvent
  | SecretScanningDataSourceGetEvent
  | SecretScanningDataSourceCreateEvent
  | SecretScanningDataSourceUpdateEvent
  | SecretScanningDataSourceDeleteEvent
  | SecretScanningDataSourceTriggerScanEvent
  | SecretScanningDataSourceScanEvent
  | SecretScanningResourceListEvent
  | SecretScanningResourceAddEvent
  | SecretScanningResourceRemoveEvent
  | SecretScanningScanListEvent
  | SecretScanningFindingListEvent
  | SecretScanningFindingLocationListEvent
  | SecretScanningFindingUpdateEvent
  | SecretScanningConfigUpdateEvent
  | SecretScanningConfigReadEvent;
