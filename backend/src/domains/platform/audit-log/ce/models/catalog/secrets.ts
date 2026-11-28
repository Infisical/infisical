import { EventType } from "../event-type";
import type {
  TAuditLogExternalMigrationImportStatus,
  TAuditLogHoneyTokenManagedBy,
  TAuditLogHoneyTokenType
} from "./shared";

export interface GetSecretsEvent {
  type: EventType.GET_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
  };
}

export type TSecretMetadata = { key: string; value: string }[];

export interface GetSecretEvent {
  type: EventType.GET_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
    secretMetadata?: TSecretMetadata;
  };
}

export interface CreateSecretEvent {
  type: EventType.CREATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
    secretMetadata?: TSecretMetadata;
    secretTags?: string[];
  };
}

export interface CreateSecretBatchEvent {
  type: EventType.CREATE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{
      secretId: string;
      secretKey: string;
      secretPath?: string;
      secretVersion: number;
      secretMetadata?: TSecretMetadata;
      secretTags?: string[];
    }>;
  };
}

export interface UpdateSecretEvent {
  type: EventType.UPDATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
    secretMetadata?: TSecretMetadata;
    secretTags?: string[];
  };
}

export interface UpdateSecretBatchEvent {
  type: EventType.UPDATE_SECRETS;
  metadata: {
    environment: string;
    secretPath?: string;
    secrets: Array<{
      secretId: string;
      secretKey: string;
      secretVersion: number;
      secretMetadata?: TSecretMetadata;
      secretPath?: string;
      secretTags?: string[];
    }>;
  };
}

export interface MoveSecretsEvent {
  type: EventType.MOVE_SECRETS;
  metadata: {
    sourceEnvironment: string;
    sourceSecretPath: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
    secretIds: string[];
  };
}

// The searched value is never recorded, only how many places it was found in. An audit log is read by
// more people than the search itself is run by, so logging the value would widen who learns it.
export interface SearchSecretsByValueEvent {
  type: EventType.SEARCH_SECRETS_BY_VALUE;
  metadata: {
    matchCount: number;
  };
}

export interface EnableOrgWideSecretValueTrackingEvent {
  type: EventType.ENABLE_ORG_WIDE_SECRET_VALUE_TRACKING;
  metadata: {
    projectsTotal: number;
  };
}

export interface DuplicateSecretEvent {
  type: EventType.DUPLICATE_SECRET;
  metadata: {
    sourceEnvironment: string;
    sourceSecretPath: string;
    sourceSecretId: string;
    sourceSecretKey: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
    destinationSecretId?: string;
    approvalRequestId?: string;
    shouldOverwrite: boolean;
    attributesCopied: TAuditLogDuplicateSecretAttributes;
  };
}

export interface DeleteSecretEvent {
  type: EventType.DELETE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
  };
}

export interface DeleteSecretBatchEvent {
  type: EventType.DELETE_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    secrets: Array<{ secretId: string; secretKey: string; secretVersion: number }>;
  };
}

export interface RedactSecretVersionValueEvent {
  type: EventType.REDACT_SECRET_VERSION_VALUE;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersionId: string;
    secretVersion: number;
  };
}

export interface GetProjectKeyEvent {
  type: EventType.GET_PROJECT_KEY;
  metadata: {
    keyId: string;
  };
}

export interface AuthorizeIntegrationEvent {
  type: EventType.AUTHORIZE_INTEGRATION;
  metadata: {
    integration: string;
  };
}

export interface UpdateIntegrationAuthEvent {
  type: EventType.UPDATE_INTEGRATION_AUTH;
  metadata: {
    integration: string;
  };
}

export interface UnauthorizeIntegrationEvent {
  type: EventType.UNAUTHORIZE_INTEGRATION;
  metadata: {
    integration: string;
  };
}

export interface CreateIntegrationEvent {
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

export interface DeleteIntegrationEvent {
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
    shouldDeleteIntegrationSecrets?: boolean;
  };
}

export interface ManualSyncIntegrationEvent {
  type: EventType.MANUAL_SYNC_INTEGRATION;
  metadata: {
    integrationId: string;
    integration: string;
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

export interface GetSecretImportsEvent {
  type: EventType.GET_SECRET_IMPORTS;
  metadata: {
    environment: string;
    folderId: string;
    numberOfImports: number;
  };
}

export interface GetSecretImportEvent {
  type: EventType.GET_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
  };
}

export interface CreateSecretImportEvent {
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

export interface UpdateSecretImportEvent {
  type: EventType.UPDATE_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
    importToEnvironment: string;
    importToSecretPath: string;
    position: number;
    orderBefore?: {
      environment: string;
      secretPath: string;
    }[];
    orderAfter?: {
      environment: string;
      secretPath: string;
    }[];
  };
}

export interface DeleteSecretImportEvent {
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

export interface AttemptCreateSlackIntegration {
  type: EventType.ATTEMPT_CREATE_SLACK_INTEGRATION;
  metadata: {
    slug: string;
    description?: string;
  };
}

export interface AttemptReinstallSlackIntegration {
  type: EventType.ATTEMPT_REINSTALL_SLACK_INTEGRATION;
  metadata: {
    id: string;
  };
}

export interface UpdateSlackIntegration {
  type: EventType.UPDATE_SLACK_INTEGRATION;
  metadata: {
    id: string;
    slug: string;
    description?: string;
  };
}

export interface DeleteSlackIntegration {
  type: EventType.DELETE_SLACK_INTEGRATION;
  metadata: {
    id: string;
  };
}

export interface GetSlackIntegration {
  type: EventType.GET_SLACK_INTEGRATION;
  metadata: {
    id: string;
  };
}

export interface IntegrationSyncedEvent {
  type: EventType.INTEGRATION_SYNCED;
  metadata: {
    integrationId: string;
    lastSyncJobId: string;
    lastUsed: Date;
    syncMessage: string;
    isSynced: boolean;
  };
}

export interface CreateSharedSecretEvent {
  type: EventType.CREATE_SHARED_SECRET;
  metadata: {
    id: string;
    accessType: string;
    name?: string;
    expiresAfterViews?: number;
    usingPassword: boolean;
    expiresAt: string;
    emails?: string[];
  };
}

export interface CreateSecretRequestEvent {
  type: EventType.CREATE_SECRET_REQUEST;
  metadata: {
    id: string;
    accessType: string;
    name?: string;
  };
}

export interface DeleteSharedSecretEvent {
  type: EventType.DELETE_SHARED_SECRET;
  metadata: {
    id: string;
    name?: string;
  };
}

export interface ReadSharedSecretEvent {
  type: EventType.READ_SHARED_SECRET;
  metadata: {
    id: string;
    name?: string;
    accessType: string;
  };
}

export interface SecretReminderCreateEvent {
  type: EventType.CREATE_SECRET_REMINDER;
  metadata: {
    secretId: string;
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
  };
}

export interface SecretReminderGetEvent {
  type: EventType.GET_SECRET_REMINDER;
  metadata: {
    secretId: string;
  };
}

export interface SecretReminderDeleteEvent {
  type: EventType.DELETE_SECRET_REMINDER;
  metadata: {
    secretId: string;
  };
}

export interface DashboardListSecretsEvent {
  type: EventType.DASHBOARD_LIST_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
    secretIds: string[];
  };
}

export interface SearchSecretsByMetadataEvent {
  type: EventType.SEARCH_SECRETS_BY_METADATA;
  metadata: {
    operator: string;
    filters: { key: string; value: string; operator: string }[];
    tags?: string[];
    numberOfSecrets: number;
    secrets: { id: string; secretKey: string; environment: string; secretPath: string }[];
  };
}

export interface DashboardGetSecretValueEvent {
  type: EventType.DASHBOARD_GET_SECRET_VALUE;
  metadata: {
    secretId: string;
    secretKey: string;
    environment: string;
    secretPath: string;
  };
}

export interface DashboardGetSecretVersionValueEvent {
  type: EventType.DASHBOARD_GET_SECRET_VERSION_VALUE;
  metadata: {
    secretId: string;
    version: string;
  };
}

export interface GetDynamicSecretLeaseEvent {
  type: EventType.GET_DYNAMIC_SECRET_LEASE;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    leaseId: string;
    leaseExternalEntityId: string;
    leaseExpireAt: Date;

    projectId: string;
    environment: string;
    secretPath: string;
  };
}

export interface RenewDynamicSecretLeaseEvent {
  type: EventType.RENEW_DYNAMIC_SECRET_LEASE;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    leaseId: string;
    leaseExternalEntityId: string;
    newLeaseExpireAt: Date;

    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface CreateDynamicSecretLeaseEvent {
  type: EventType.CREATE_DYNAMIC_SECRET_LEASE;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    leaseId: string;
    leaseExternalEntityId: string;
    leaseExpireAt: Date;

    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface DeleteDynamicSecretLeaseEvent {
  type: EventType.DELETE_DYNAMIC_SECRET_LEASE;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    leaseId: string;
    leaseExternalEntityId: string;
    leaseStatus?: string | null;

    environment: string;
    secretPath: string;
    projectId: string;

    isForced: boolean;
  };
}

export interface CreateDynamicSecretEvent {
  type: EventType.CREATE_DYNAMIC_SECRET;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretType: string;
    dynamicSecretId: string;
    defaultTTL: string;
    maxTTL?: string | null;
    gatewayV2Id?: string | null;
    usernameTemplate?: string | null;

    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface UpdateDynamicSecretEvent {
  type: EventType.UPDATE_DYNAMIC_SECRET;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;
    updatedFields: string[];

    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface DeleteDynamicSecretEvent {
  type: EventType.DELETE_DYNAMIC_SECRET;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface GetDynamicSecretEvent {
  type: EventType.GET_DYNAMIC_SECRET;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface ListDynamicSecretsEvent {
  type: EventType.LIST_DYNAMIC_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    projectId: string;
  };
}

export interface ListDynamicSecretLeasesEvent {
  type: EventType.LIST_DYNAMIC_SECRET_LEASES;
  metadata: {
    dynamicSecretName: string;
    dynamicSecretId: string;
    dynamicSecretType: string;

    environment: string;
    secretPath: string;
    projectId: string;

    leaseCount: number;
  };
}

export interface SecretValidationRuleCreateEvent {
  type: EventType.SECRET_VALIDATION_RULE_CREATE;
  metadata: {
    ruleId: string;
    name: string;
    type: string;
    environment?: string;
    secretPath: string;
    isActive: boolean;
  };
}

export interface SecretValidationRuleUpdateEvent {
  type: EventType.SECRET_VALIDATION_RULE_UPDATE;
  metadata: {
    ruleId: string;
    name?: string;
    type?: string;
    environmentSlug?: string | null;
    secretPath?: string;
    isActive?: boolean;
  };
}

export interface SecretValidationRuleDeleteEvent {
  type: EventType.SECRET_VALIDATION_RULE_DELETE;
  metadata: {
    ruleId: string;
    name: string;
    type: string;
  };
}

export interface ExternalMigrationCreateEvent {
  type: EventType.EXTERNAL_MIGRATION_CREATE;
  metadata: {
    configId: string;
    provider: string;
    connectionId: string | null;
  };
}

export interface ExternalMigrationUpdateEvent {
  type: EventType.EXTERNAL_MIGRATION_UPDATE;
  metadata: {
    configId: string;
    provider: string;
    connectionId: string | null;
  };
}

export interface ExternalMigrationDeleteEvent {
  type: EventType.EXTERNAL_MIGRATION_DELETE;
  metadata: {
    configId: string;
    provider: string;
  };
}

export interface ImportVaultSecretsEvent {
  type: EventType.IMPORT_VAULT_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    vaultNamespace: string;
    mountPath: string;
    vaultSecretPaths: string[];
    connectionId: string;
    keepVaultStructure: boolean;
    status: TAuditLogExternalMigrationImportStatus;
    importedSecretCount: number;
    approvalRequiredSecretCount: number;
    importedPaths?: string[];
    approvalRequiredPaths?: string[];
  };
}

export interface CreateHoneyTokenEvent {
  type: EventType.CREATE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: TAuditLogHoneyTokenType;
    managedBy: TAuditLogHoneyTokenManagedBy;
    environment: string;
    secretPath: string;
  };
}

export interface UpdateHoneyTokenEvent {
  type: EventType.UPDATE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: TAuditLogHoneyTokenType;
    environment: string;
    secretPath: string;
  };
}

export interface RevokeHoneyTokenEvent {
  type: EventType.REVOKE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: TAuditLogHoneyTokenType;
    environment: string;
    secretPath: string;
  };
}

export interface DeleteHoneyTokenEvent {
  type: EventType.DELETE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: TAuditLogHoneyTokenType;
    environment: string;
    secretPath: string;
  };
}

export interface TriggerHoneyTokenEvent {
  type: EventType.TRIGGER_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: TAuditLogHoneyTokenType;
    projectId: string;
    eventName: string;
    eventTime: string;
    sourceIp: string;
    awsRegion: string;
  };
}

export interface CreateProjectFolderGrantEvent {
  type: EventType.CREATE_PROJECT_FOLDER_GRANT;
  metadata: {
    grantId: string;
    sourceProjectId: string;
    targetProjectId: string;
    environment: string;
    secretPath: string;
  };
}

export interface DeleteProjectFolderGrantEvent {
  type: EventType.DELETE_PROJECT_FOLDER_GRANT;
  metadata: {
    grantId: string;
    sourceProjectId: string;
    targetProjectId: string;
    environment: string;
    secretPath: string;
  };
}

export interface SecretFolderAccessEventMetadata {
  folderAccessId: string;
  folderId: string;
  environment: string;
  secretPath: string;
  permission: string;
  isPermissionRecursive: boolean;
  userId?: string;
  identityId?: string;
  isTemporary: boolean;
  temporaryMode?: string;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
}

export interface CreateSecretFolderAccessEvent {
  type: EventType.CREATE_SECRET_FOLDER_ACCESS;
  metadata: SecretFolderAccessEventMetadata;
}

export interface UpdateSecretFolderAccessEvent {
  type: EventType.UPDATE_SECRET_FOLDER_ACCESS;
  metadata: SecretFolderAccessEventMetadata;
}

export interface DeleteSecretFolderAccessEvent {
  type: EventType.DELETE_SECRET_FOLDER_ACCESS;
  metadata: SecretFolderAccessEventMetadata;
}

export type TAuditLogDuplicateSecretAttributes = {
  value?: boolean;
  comment?: boolean;
  tags?: boolean;
  metadata?: boolean;
  skipMultilineEncoding?: boolean;
};

export type TSecretsAuditLogEvent =
  | GetSecretsEvent
  | GetSecretEvent
  | CreateSecretEvent
  | CreateSecretBatchEvent
  | UpdateSecretEvent
  | UpdateSecretBatchEvent
  | MoveSecretsEvent
  | SearchSecretsByValueEvent
  | EnableOrgWideSecretValueTrackingEvent
  | DuplicateSecretEvent
  | DeleteSecretEvent
  | DeleteSecretBatchEvent
  | RedactSecretVersionValueEvent
  | GetProjectKeyEvent
  | AuthorizeIntegrationEvent
  | UpdateIntegrationAuthEvent
  | UnauthorizeIntegrationEvent
  | CreateIntegrationEvent
  | DeleteIntegrationEvent
  | ManualSyncIntegrationEvent
  | GetSecretImportsEvent
  | GetSecretImportEvent
  | CreateSecretImportEvent
  | UpdateSecretImportEvent
  | DeleteSecretImportEvent
  | AttemptCreateSlackIntegration
  | AttemptReinstallSlackIntegration
  | UpdateSlackIntegration
  | DeleteSlackIntegration
  | GetSlackIntegration
  | IntegrationSyncedEvent
  | CreateSharedSecretEvent
  | CreateSecretRequestEvent
  | DeleteSharedSecretEvent
  | ReadSharedSecretEvent
  | SecretReminderCreateEvent
  | SecretReminderGetEvent
  | SecretReminderDeleteEvent
  | DashboardListSecretsEvent
  | SearchSecretsByMetadataEvent
  | DashboardGetSecretValueEvent
  | DashboardGetSecretVersionValueEvent
  | GetDynamicSecretLeaseEvent
  | RenewDynamicSecretLeaseEvent
  | CreateDynamicSecretLeaseEvent
  | DeleteDynamicSecretLeaseEvent
  | CreateDynamicSecretEvent
  | UpdateDynamicSecretEvent
  | DeleteDynamicSecretEvent
  | GetDynamicSecretEvent
  | ListDynamicSecretsEvent
  | ListDynamicSecretLeasesEvent
  | SecretValidationRuleCreateEvent
  | SecretValidationRuleUpdateEvent
  | SecretValidationRuleDeleteEvent
  | ExternalMigrationCreateEvent
  | ExternalMigrationUpdateEvent
  | ExternalMigrationDeleteEvent
  | ImportVaultSecretsEvent
  | CreateHoneyTokenEvent
  | UpdateHoneyTokenEvent
  | RevokeHoneyTokenEvent
  | TriggerHoneyTokenEvent
  | CreateProjectFolderGrantEvent
  | DeleteProjectFolderGrantEvent
  | CreateSecretFolderAccessEvent
  | UpdateSecretFolderAccessEvent
  | DeleteSecretFolderAccessEvent
  | DeleteHoneyTokenEvent;
