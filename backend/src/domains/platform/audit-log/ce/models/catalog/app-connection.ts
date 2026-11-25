import { EventType } from "../event-type";
import type { TAuditLogAppConnection } from "./shared";

export interface GetAppConnectionsEvent {
  type: EventType.GET_APP_CONNECTIONS;
  metadata: {
    app?: TAuditLogAppConnection;
    count: number;
    connectionIds: string[];
  };
}

export interface GetAvailableAppConnectionsDetailsEvent {
  type: EventType.GET_AVAILABLE_APP_CONNECTIONS_DETAILS;
  metadata: {
    app?: TAuditLogAppConnection;
    count: number;
    connectionIds: string[];
  };
}

export interface GetAppConnectionEvent {
  type: EventType.GET_APP_CONNECTION;
  metadata: {
    connectionId: string;
  };
}

export interface GetAppConnectionUsageEvent {
  type: EventType.GET_APP_CONNECTION_USAGE;
  metadata: {
    connectionId: string;
  };
}

export interface MigrateAppConnectionEvent {
  type: EventType.MIGRATE_APP_CONNECTION;
  metadata: {
    connectionId: string;
  };
}

export interface CreateAppConnectionEvent {
  type: EventType.CREATE_APP_CONNECTION;
  metadata: TAuditLogAppConnectionCreate & { connectionId: string };
}

export interface UpdateAppConnectionEvent {
  type: EventType.UPDATE_APP_CONNECTION;
  metadata: TAuditLogAppConnectionUpdate & {
    credentialsUpdated: boolean;
  };
}

export interface DeleteAppConnectionEvent {
  type: EventType.DELETE_APP_CONNECTION;
  metadata: {
    connectionId: string;
  };
}

export interface RotateAppConnectionCredentialsEvent {
  type: EventType.ROTATE_APP_CONNECTION_CREDENTIALS;
  metadata: {
    connectionId: string;
  };
}

export interface CreateHsmConnectorEvent {
  type: EventType.CREATE_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
    gatewayId: string | null;
    gatewayPoolId: string | null;
  };
}

export interface UpdateHsmConnectorEvent {
  type: EventType.UPDATE_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
    fieldsUpdated: string[];
  };
}

export interface DeleteHsmConnectorEvent {
  type: EventType.DELETE_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
  };
}

export interface TestHsmConnectorEvent {
  type: EventType.TEST_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
    ok: boolean;
    memberCount: number;
  };
}

export interface CreateGitHubAppEvent {
  type: EventType.CREATE_GITHUB_APP;
  metadata: {
    gitHubAppId: string;
    name: string;
    appId: string;
    slug: string;
    owner?: string | null;
    host?: string | null;
    instanceType: string;
    projectId?: string | null;
  };
}

export interface DeleteGitHubAppEvent {
  type: EventType.DELETE_GITHUB_APP;
  metadata: {
    gitHubAppId: string;
    name: string;
    appId: string;
    slug: string;
    projectId?: string | null;
  };
}

export type TAuditLogAppConnectionRotation = {
  rotationInterval?: number;
  rotateAtUtc?: { hours: number; minutes: number };
};

export type TAuditLogAppConnectionCreate = {
  name: string;
  method: string;
  app: TAuditLogAppConnection;
  description?: string | null;
  isPlatformManagedCredentials?: boolean;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  isAutoRotationEnabled?: boolean;
  rotation?: TAuditLogAppConnectionRotation | null;
  configuration?: Record<string, unknown>;
};

export type TAuditLogAppConnectionUpdate = Partial<
  Omit<TAuditLogAppConnectionCreate, "method" | "app" | "rotation">
> & {
  connectionId: string;
  rotation?: TAuditLogAppConnectionRotation;
};

export type TAppConnectionAuditLogEvent =
  | GetAppConnectionsEvent
  | GetAvailableAppConnectionsDetailsEvent
  | GetAppConnectionEvent
  | GetAppConnectionUsageEvent
  | MigrateAppConnectionEvent
  | CreateAppConnectionEvent
  | UpdateAppConnectionEvent
  | DeleteAppConnectionEvent
  | RotateAppConnectionCredentialsEvent
  | CreateHsmConnectorEvent
  | UpdateHsmConnectorEvent
  | DeleteHsmConnectorEvent
  | TestHsmConnectorEvent
  | CreateGitHubAppEvent
  | DeleteGitHubAppEvent;
