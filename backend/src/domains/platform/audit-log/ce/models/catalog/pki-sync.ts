import { EventType } from "../event-type";
import type { TAuditLogPkiKeystorePasswordChange } from "./shared";

export interface GetPkiSyncsEvent {
  type: EventType.GET_PKI_SYNCS;
  metadata: {
    projectId: string;
  };
}

export interface GetPkiSyncEvent {
  type: EventType.GET_PKI_SYNC;
  metadata: {
    destination: string;
    syncId: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface GetPkiSyncCertificatesEvent {
  type: EventType.GET_PKI_SYNC_CERTIFICATES;
  metadata: {
    syncId: string;
    count: number;
    certificateIds: string[];
    destination: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface CreatePkiSyncEvent {
  type: EventType.CREATE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    destination: string;
    applicationId?: string;
    applicationName?: string;
    connectionId?: string;
    connectionName?: string;
    targetHost?: string;
    hasCredentials?: boolean;
    hasPostSyncCommand?: boolean;
    hasHealthCheckCommand?: boolean;
    hasFilters?: boolean;
  };
}

export interface UpdatePkiSyncEvent {
  type: EventType.UPDATE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    applicationId?: string;
    applicationName?: string;
    destination?: string;
    connectionId?: string;
    connectionName?: string;
    targetHost?: string;
    hasPostSyncCommand?: boolean;
    hasHealthCheckCommand?: boolean;
    hasFilters?: boolean;
  };
}

export interface DeletePkiSyncEvent {
  type: EventType.DELETE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    destination: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface PkiSyncSyncCertificatesEvent {
  type: EventType.PKI_SYNC_SYNC_CERTIFICATES;
  metadata: {
    syncId: string;
    syncMessage: string | null;
    jobId: string;
    jobRanAt: Date;
    healthCheck?: { command: string; result?: TAuditLogHostCommandResult };
    postSyncCommand?: { command: string; result?: TAuditLogHostCommandResult };
  };
}

export interface PkiSyncImportCertificatesEvent {
  type: EventType.PKI_SYNC_IMPORT_CERTIFICATES;
  metadata: {
    syncId: string;
    importMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

export interface PkiSyncTestHealthCheckEvent {
  type: EventType.PKI_SYNC_TEST_HEALTH_CHECK;
  metadata: {
    connectionId: string;
    connectionName: string;
    destination: string;
    command: string;
    result?: TAuditLogHostCommandResult;
  };
}

export interface PkiSyncHealthCheckEvent {
  type: EventType.PKI_SYNC_HEALTH_CHECK;
  metadata: {
    syncId: string;
    syncName: string;
    destination: string;
    command: string;
    result?: TAuditLogHostCommandResult;
  };
}

export interface PkiSyncRemoveCertificatesEvent {
  type: EventType.PKI_SYNC_REMOVE_CERTIFICATES;
  metadata: {
    syncId: string;
    removeMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

export interface PkiSyncLinkCertificatesEvent {
  type: EventType.PKI_SYNC_LINK_CERTIFICATES;
  metadata: {
    pkiSyncId: string;
    name: string;
    count: number;
    certificates: { id: string; commonName: string }[];
    applicationId?: string;
    applicationName?: string;
  };
}

export interface PkiSyncUnlinkCertificatesEvent {
  type: EventType.PKI_SYNC_UNLINK_CERTIFICATES;
  metadata: {
    pkiSyncId: string;
    name: string;
    count: number;
    certificates: { id: string; commonName: string }[];
    removedFromDestination?: boolean;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface PkiSyncSkipCertificateEvent {
  type: EventType.PKI_SYNC_SKIP_CERTIFICATE;
  metadata: {
    pkiSyncId: string;
    name: string;
    certificateId: string;
    commonName: string;
    reason: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface PkiSyncSetDefaultCertificateEvent {
  type: EventType.PKI_SYNC_SET_DEFAULT_CERTIFICATE;
  metadata: {
    pkiSyncId: string;
    name: string;
    certificateId: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface PkiSyncClearDefaultCertificateEvent {
  type: EventType.PKI_SYNC_CLEAR_DEFAULT_CERTIFICATE;
  metadata: {
    pkiSyncId: string;
    name: string;
    applicationId?: string;
    applicationName?: string;
  };
}

export interface CreatePkiDiscoveryEvent {
  type: EventType.CREATE_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

export interface UpdatePkiDiscoveryEvent {
  type: EventType.UPDATE_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

export interface DeletePkiDiscoveryEvent {
  type: EventType.DELETE_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

export interface GetPkiDiscoveryEvent {
  type: EventType.GET_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

export interface GetPkiDiscoveriesEvent {
  type: EventType.GET_PKI_DISCOVERIES;
  metadata: {
    count: number;
  };
}

export interface TriggerPkiDiscoveryScanEvent {
  type: EventType.TRIGGER_PKI_DISCOVERY_SCAN;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

export interface GetPkiInstallationEvent {
  type: EventType.GET_PKI_INSTALLATION;
  metadata: {
    installationId: string;
    name?: string;
  };
}

export interface GetPkiInstallationsEvent {
  type: EventType.GET_PKI_INSTALLATIONS;
  metadata: {
    count: number;
  };
}

export interface UpdatePkiInstallationEvent {
  type: EventType.UPDATE_PKI_INSTALLATION;
  metadata: {
    installationId: string;
    name?: string;
    type?: string;
    keystorePasswordChange?: TAuditLogPkiKeystorePasswordChange;
  };
}

export interface DeletePkiInstallationEvent {
  type: EventType.DELETE_PKI_INSTALLATION;
  metadata: {
    installationId: string;
    name: string | null;
  };
}

export type TAuditLogHostCommandResult = {
  status: "succeeded" | "failed";
  exitCode?: number;
  timedOut?: boolean;
  failure?: "timed-out" | "rejected" | "unreachable";
  durationMs: number;
  output?: string;
  failureDetail?: string;
  error?: string;
};

export type TPkiSyncAuditLogEvent =
  | GetPkiSyncsEvent
  | GetPkiSyncEvent
  | GetPkiSyncCertificatesEvent
  | CreatePkiSyncEvent
  | UpdatePkiSyncEvent
  | DeletePkiSyncEvent
  | PkiSyncSyncCertificatesEvent
  | PkiSyncImportCertificatesEvent
  | PkiSyncTestHealthCheckEvent
  | PkiSyncHealthCheckEvent
  | PkiSyncRemoveCertificatesEvent
  | PkiSyncLinkCertificatesEvent
  | PkiSyncUnlinkCertificatesEvent
  | PkiSyncSkipCertificateEvent
  | PkiSyncSetDefaultCertificateEvent
  | PkiSyncClearDefaultCertificateEvent
  | CreatePkiDiscoveryEvent
  | UpdatePkiDiscoveryEvent
  | DeletePkiDiscoveryEvent
  | GetPkiDiscoveryEvent
  | GetPkiDiscoveriesEvent
  | TriggerPkiDiscoveryScanEvent
  | GetPkiInstallationEvent
  | GetPkiInstallationsEvent
  | UpdatePkiInstallationEvent
  | DeletePkiInstallationEvent;
