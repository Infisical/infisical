import { ActorType, EventType } from "./enums";
import { IServiceTokenV3TrustedIp } from "../../../models/serviceTokenDataV3";

interface UserActorMetadata {
  userId: string;
  email: string;
}

interface ServiceActorMetadata {
  serviceId: string;
  name: string;
}

export interface UserActor {
  type: ActorType.USER;
  metadata: UserActorMetadata;
}

export interface ServiceActor {
  type: ActorType.SERVICE;
  metadata: ServiceActorMetadata;
}

export interface ServiceActorV3 {
  type: ActorType.SERVICE_V3;
  metadata: ServiceActorMetadata;
}

// export interface MachineActor {
//   type: ActorType.Machine;
// }

export type Actor = UserActor | ServiceActor | ServiceActorV3;

interface GetSecretsEvent {
  type: EventType.GET_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
  };
}

interface GetSecretEvent {
  type: EventType.GET_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface CreateSecretEvent {
  type: EventType.CREATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface CreateSecretBatchEvent {
  type: EventType.CREATE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{ secretId: string; secretKey: string; secretVersion: number }>;
  };
}

interface UpdateSecretEvent {
  type: EventType.UPDATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface UpdateSecretBatchEvent {
  type: EventType.UPDATE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{ secretId: string; secretKey: string; secretVersion: number }>;
  };
}

interface DeleteSecretEvent {
  type: EventType.DELETE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

interface DeleteSecretBatchEvent {
  type: EventType.DELETE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{ secretId: string; secretKey: string; secretVersion: number }>;
  };
}

interface GetWorkspaceKeyEvent {
  type: EventType.GET_WORKSPACE_KEY;
  metadata: {
    keyId: string;
  };
}

interface AuthorizeIntegrationEvent {
  type: EventType.AUTHORIZE_INTEGRATION;
  metadata: {
    integration: string;
  };
}

interface UnauthorizeIntegrationEvent {
  type: EventType.UNAUTHORIZE_INTEGRATION;
  metadata: {
    integration: string;
  };
}

interface CreateIntegrationEvent {
  type: EventType.CREATE_INTEGRATION;
  metadata: {
    integrationId: string;
    integration: string; // TODO: fix type
    environment: string;
    secretPath: string;
    url?: string;
    app?: string;
    appId?: string;
    targetEnvironment?: string;
    targetEnvironmentId?: string;
    targetService?: string;
    targetServiceId?: string;
    path?: string;
    region?: string;
  };
}

interface DeleteIntegrationEvent {
  type: EventType.DELETE_INTEGRATION;
  metadata: {
    integrationId: string;
    integration: string; // TODO: fix type
    environment: string;
    secretPath: string;
    url?: string;
    app?: string;
    appId?: string;
    targetEnvironment?: string;
    targetEnvironmentId?: string;
    targetService?: string;
    targetServiceId?: string;
    path?: string;
    region?: string;
  };
}

interface AddTrustedIPEvent {
  type: EventType.ADD_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

interface UpdateTrustedIPEvent {
  type: EventType.UPDATE_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

interface DeleteTrustedIPEvent {
  type: EventType.DELETE_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

interface CreateServiceTokenEvent {
  type: EventType.CREATE_SERVICE_TOKEN;
  metadata: {
    name: string;
    scopes: Array<{
      environment: string;
      secretPath: string;
    }>;
  };
}

interface DeleteServiceTokenEvent {
  type: EventType.DELETE_SERVICE_TOKEN;
  metadata: {
    name: string;
    scopes: Array<{
      environment: string;
      secretPath: string;
    }>;
  };
}

interface CreateServiceTokenV3Event {
  type: EventType.CREATE_SERVICE_TOKEN_V3;
  metadata: {
    name: string;
    isActive: boolean;
    role: string;
    trustedIps: Array<IServiceTokenV3TrustedIp>;
    expiresAt?: Date;
  };
}

interface UpdateServiceTokenV3Event {
  type: EventType.UPDATE_SERVICE_TOKEN_V3;
  metadata: {
    name?: string;
    isActive?: boolean;
    role?: string;
    trustedIps?: Array<IServiceTokenV3TrustedIp>;
    expiresAt?: Date;
  };
}

interface DeleteServiceTokenV3Event {
  type: EventType.DELETE_SERVICE_TOKEN_V3;
  metadata: {
    name: string;
    isActive: boolean;
    role: string;
    expiresAt?: Date;
    trustedIps: Array<IServiceTokenV3TrustedIp>;
  };
}

interface CreateEnvironmentEvent {
  type: EventType.CREATE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

interface UpdateEnvironmentEvent {
  type: EventType.UPDATE_ENVIRONMENT;
  metadata: {
    oldName: string;
    newName: string;
    oldSlug: string;
    newSlug: string;
  };
}

interface DeleteEnvironmentEvent {
  type: EventType.DELETE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

interface AddWorkspaceMemberEvent {
  type: EventType.ADD_WORKSPACE_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface AddBatchWorkspaceMemberEvent {
  type: EventType.ADD_BATCH_WORKSPACE_MEMBER;
  metadata: Array<{
    userId: string;
    email: string;
  }>;
}

interface RemoveWorkspaceMemberEvent {
  type: EventType.REMOVE_WORKSPACE_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface CreateFolderEvent {
  type: EventType.CREATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    folderName: string;
    folderPath: string;
  };
}

interface UpdateFolderEvent {
  type: EventType.UPDATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    oldFolderName: string;
    newFolderName: string;
    folderPath: string;
  };
}

interface DeleteFolderEvent {
  type: EventType.DELETE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    folderName: string;
    folderPath: string;
  };
}

interface CreateWebhookEvent {
  type: EventType.CREATE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    webhookUrl: string;
    isDisabled: boolean;
  };
}

interface UpdateWebhookStatusEvent {
  type: EventType.UPDATE_WEBHOOK_STATUS;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    webhookUrl: string;
    isDisabled: boolean;
  };
}

interface DeleteWebhookEvent {
  type: EventType.DELETE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    webhookUrl: string;
    isDisabled: boolean;
  };
}

interface GetSecretImportsEvent {
  type: EventType.GET_SECRET_IMPORTS;
  metadata: {
    environment: string;
    secretImportId: string;
    folderId: string;
    numberOfImports: number;
  };
}

interface CreateSecretImportEvent {
  type: EventType.CREATE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importFromEnvironment: string;
    importFromSecretPath: string;
    importToEnvironment: string;
    importToSecretPath: string;
  };
}

interface UpdateSecretImportEvent {
  type: EventType.UPDATE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importToEnvironment: string;
    importToSecretPath: string;
    orderBefore: {
      environment: string;
      secretPath: string;
    }[];
    orderAfter: {
      environment: string;
      secretPath: string;
    }[];
  };
}

interface DeleteSecretImportEvent {
  type: EventType.DELETE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importFromEnvironment: string;
    importFromSecretPath: string;
    importToEnvironment: string;
    importToSecretPath: string;
  };
}

interface UpdateUserRole {
  type: EventType.UPDATE_USER_WORKSPACE_ROLE;
  metadata: {
    userId: string;
    email: string;
    oldRole: string;
    newRole: string;
  };
}

interface UpdateUserDeniedPermissions {
  type: EventType.UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS;
  metadata: {
    userId: string;
    email: string;
    deniedPermissions: {
      environmentSlug: string;
      ability: string;
    }[];
  };
}
interface SecretApprovalMerge {
  type: EventType.SECRET_APPROVAL_MERGED;
  metadata: {
    mergedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

interface SecretApprovalClosed {
  type: EventType.SECRET_APPROVAL_CLOSED;
  metadata: {
    closedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

interface SecretApprovalReopened {
  type: EventType.SECRET_APPROVAL_REOPENED;
  metadata: {
    reopenedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

interface SecretApprovalRequest {
  type: EventType.SECRET_APPROVAL_REQUEST;
  metadata: {
    committedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

export type Event =
  | GetSecretsEvent
  | GetSecretEvent
  | CreateSecretEvent
  | CreateSecretBatchEvent
  | UpdateSecretEvent
  | UpdateSecretBatchEvent
  | DeleteSecretEvent
  | DeleteSecretBatchEvent
  | GetWorkspaceKeyEvent
  | AuthorizeIntegrationEvent
  | UnauthorizeIntegrationEvent
  | CreateIntegrationEvent
  | DeleteIntegrationEvent
  | AddTrustedIPEvent
  | UpdateTrustedIPEvent
  | DeleteTrustedIPEvent
  | CreateServiceTokenEvent
  | DeleteServiceTokenEvent
  | CreateServiceTokenV3Event
  | UpdateServiceTokenV3Event
  | DeleteServiceTokenV3Event
  | CreateEnvironmentEvent
  | UpdateEnvironmentEvent
  | DeleteEnvironmentEvent
  | AddWorkspaceMemberEvent
  | AddBatchWorkspaceMemberEvent
  | RemoveWorkspaceMemberEvent
  | CreateFolderEvent
  | UpdateFolderEvent
  | DeleteFolderEvent
  | CreateWebhookEvent
  | UpdateWebhookStatusEvent
  | DeleteWebhookEvent
  | GetSecretImportsEvent
  | CreateSecretImportEvent
  | UpdateSecretImportEvent
  | DeleteSecretImportEvent
  | UpdateUserRole
  | UpdateUserDeniedPermissions
  | SecretApprovalMerge
  | SecretApprovalClosed
  | SecretApprovalRequest
  | SecretApprovalReopened;
