import { EventType } from "../event-type";
import type { TAuditLogSecretRotation, TAuditLogSecretRotationStatus } from "./shared";

export interface GetSecretRotationsEvent {
  type: EventType.GET_SECRET_ROTATIONS;
  metadata: {
    type?: TAuditLogSecretRotation;
    count: number;
    rotationIds: string[];
    secretPath?: string;
    environment?: string;
  };
}

export interface GetSecretRotationEvent {
  type: EventType.GET_SECRET_ROTATION;
  metadata: {
    type: TAuditLogSecretRotation;
    rotationId: string;
    secretPath: string;
    environment: string;
  };
}

export interface GetSecretRotationCredentialsEvent {
  type: EventType.GET_SECRET_ROTATION_GENERATED_CREDENTIALS;
  metadata: {
    type: TAuditLogSecretRotation;
    rotationId: string;
    secretPath: string;
    environment: string;
  };
}

export interface CreateSecretRotationEvent {
  type: EventType.CREATE_SECRET_ROTATION;
  metadata: TAuditLogSecretRotationCreate & { rotationId: string };
}

export interface UpdateSecretRotationEvent {
  type: EventType.UPDATE_SECRET_ROTATION;
  metadata: TAuditLogSecretRotationUpdate;
}

export interface DeleteSecretRotationEvent {
  type: EventType.DELETE_SECRET_ROTATION;
  metadata: TAuditLogSecretRotationDelete;
}

export interface MoveSecretRotationEvent {
  type: EventType.MOVE_SECRET_ROTATION;
  metadata: {
    type: string;
    rotationId: string;
    sourceEnvironment: string;
    sourceSecretPath: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
  };
}

export interface RotateSecretRotationEvent {
  type: EventType.SECRET_ROTATION_ROTATE_SECRETS;
  metadata: Pick<TAuditLogSecretRotationRaw, "parameters" | "secretsMapping" | "type" | "connectionId" | "folderId"> & {
    status: TAuditLogSecretRotationStatus;
    rotationId: string;
    jobId?: string | undefined;
    occurredAt: Date;
    message?: string | null | undefined;
  };
}

export interface ReconcileSecretRotationEvent {
  type: EventType.RECONCILE_SECRET_ROTATION;
  metadata: {
    type: string;
    rotationId: string;
    reconciled: boolean;
  };
}

export interface CheckSecretRotationCredentialsEvent {
  type: EventType.SECRET_ROTATION_CHECK_CREDENTIALS;
  metadata: {
    type: string;
    rotationId: string;
    connectionId: string;
    folderId: string;
    success: boolean;
    errorMessage?: string;
  };
}

export type TAuditLogSecretRotationCreate = {
  type: TAuditLogSecretRotation;
  name: string;
  connectionId: string;
  secretPath: string;
  environment: string;
  parameters: Record<string, unknown>;
  secretsMapping: Record<string, unknown>;
  description?: string | null;
  rotationInterval?: number;
  isAutoRotationEnabled?: boolean;
  rotateAtUtc?: { hours: number; minutes: number };
  temporaryParameters?: Record<string, unknown>;
};

export type TAuditLogSecretRotationUpdate = Partial<
  Omit<TAuditLogSecretRotationCreate, "connectionId" | "secretPath" | "environment">
> & {
  rotationId: string;
  type: TAuditLogSecretRotation;
};

export type TAuditLogSecretRotationDelete = {
  type: TAuditLogSecretRotation;
  rotationId: string;
  deleteSecrets: boolean;
  revokeGeneratedCredentials: boolean;
};

export type TAuditLogSecretRotationRaw = {
  parameters?: unknown;
  secretsMapping?: unknown;
  type: string;
  connectionId: string;
  folderId: string;
};

export type TSecretRotationAuditLogEvent =
  | GetSecretRotationsEvent
  | GetSecretRotationEvent
  | GetSecretRotationCredentialsEvent
  | CreateSecretRotationEvent
  | UpdateSecretRotationEvent
  | DeleteSecretRotationEvent
  | MoveSecretRotationEvent
  | RotateSecretRotationEvent
  | ReconcileSecretRotationEvent
  | CheckSecretRotationCredentialsEvent;
