import { EventType } from "../event-type";
import type { TAutoApprovalAuditMetadata } from "./shared";

export interface PamSessionStartEvent {
  type: EventType.PAM_SESSION_START;
  metadata: {
    sessionId: string;
    accountId?: string;
    accountName: string;
  };
}

export interface PamSessionEndEvent {
  type: EventType.PAM_SESSION_END;
  metadata: {
    sessionId: string;
    accountId?: string;
    accountName: string;
  };
}

export interface PamSessionTerminateEvent {
  type: EventType.PAM_SESSION_TERMINATE;
  metadata: {
    sessionId: string;
    accountId?: string;
    accountName: string;
  };
}

export interface PamSessionChunkUploadEvent {
  type: EventType.PAM_SESSION_CHUNK_UPLOAD;
  metadata: {
    sessionId: string;
    accountId?: string;
    chunkIndex: number;
    storageBackend: string;
    ciphertextBytes: number;
  };
}

export interface PamSessionUploadTokenInvalidEvent {
  type: EventType.PAM_SESSION_UPLOAD_TOKEN_INVALID;
  metadata: {
    sessionId: string;
    accountId?: string;
    chunkIndex?: number;
  };
}

export interface PamAccountTemplateCreateEvent {
  type: EventType.PAM_ACCOUNT_TEMPLATE_CREATE;
  metadata: {
    templateId: string;
    name: string;
    accountType: string;
  };
}

export interface PamAccountTemplateUpdateEvent {
  type: EventType.PAM_ACCOUNT_TEMPLATE_UPDATE;
  metadata: {
    templateId: string;
    name?: string;
  };
}

export interface PamAccountTemplateDeleteEvent {
  type: EventType.PAM_ACCOUNT_TEMPLATE_DELETE;
  metadata: {
    templateId: string;
    name: string;
  };
}

export interface PamFolderCreateEvent {
  type: EventType.PAM_FOLDER_CREATE;
  metadata: {
    folderId: string;
    name: string;
    description?: string | null;
  };
}

export interface PamFolderUpdateEvent {
  type: EventType.PAM_FOLDER_UPDATE;
  metadata: {
    folderId: string;
    name?: string;
    description?: string | null;
  };
}

export interface PamFolderDeleteEvent {
  type: EventType.PAM_FOLDER_DELETE;
  metadata: {
    folderId: string;
    folderName: string;
  };
}

export interface OrgAdminAccessPamFolderEvent {
  type: EventType.ORG_ADMIN_ACCESS_PAM_FOLDER;
  metadata: {
    folderId: string;
    folderName: string;
    // The role the admin held on the folder before granting themselves admin, or null if they held none.
    previousRole: string | null;
  };
}

export interface PamProductMemberAddEvent {
  type: EventType.PAM_PRODUCT_MEMBER_ADD;
  metadata: {
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

export interface PamProductMemberUpdateEvent {
  type: EventType.PAM_PRODUCT_MEMBER_UPDATE;
  metadata: {
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

export interface PamProductMemberRemoveEvent {
  type: EventType.PAM_PRODUCT_MEMBER_REMOVE;
  metadata: {
    userId?: string;
    groupId?: string;
    identityId?: string;
  };
}

export interface PamFolderMemberAddEvent {
  type: EventType.PAM_FOLDER_MEMBER_ADD;
  metadata: {
    folderId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

export interface PamFolderMemberUpdateEvent {
  type: EventType.PAM_FOLDER_MEMBER_UPDATE;
  metadata: {
    folderId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

export interface PamFolderMemberRemoveEvent {
  type: EventType.PAM_FOLDER_MEMBER_REMOVE;
  metadata: {
    folderId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
  };
}

export interface PamAccountMemberAddEvent {
  type: EventType.PAM_ACCOUNT_MEMBER_ADD;
  metadata: {
    accountId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

export interface PamAccountMemberUpdateEvent {
  type: EventType.PAM_ACCOUNT_MEMBER_UPDATE;
  metadata: {
    accountId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

export interface PamAccountMemberRemoveEvent {
  type: EventType.PAM_ACCOUNT_MEMBER_REMOVE;
  metadata: {
    accountId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
  };
}

export interface PamAccountAccessEvent {
  type: EventType.PAM_ACCOUNT_ACCESS;
  metadata: {
    accountId: string;
    resourceName: string;
    accountName: string;
    duration?: string;
    reason?: string;
  };
}

export interface PamWebAccessSessionTicketCreatedEvent {
  type: EventType.PAM_WEB_ACCESS_SESSION_TICKET_CREATED;
  metadata: {
    accountId: string;
    resourceName: string;
    accountName: string;
  };
}

export interface PamAccountCreateEvent {
  type: EventType.PAM_ACCOUNT_CREATE;
  metadata: {
    accountId: string;
    accountType: string;
    folderId: string;
    templateId: string;
    name: string;
    description?: string | null;
  };
}

export interface PamAccountUpdateEvent {
  type: EventType.PAM_ACCOUNT_UPDATE;
  metadata: {
    accountId: string;
    accountType: string;
    name?: string;
    description?: string | null;
    folderId?: string;
    templateId?: string;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    connectionDetailsUpdated?: boolean;
    credentialsUpdated?: boolean;
  };
}

export interface PamAccountDeleteEvent {
  type: EventType.PAM_ACCOUNT_DELETE;
  metadata: {
    accountId: string;
    accountType: string;
    accountName: string;
  };
}

export interface PamAccountSshCaCreateEvent {
  type: EventType.PAM_ACCOUNT_SSH_CA_CREATE;
  metadata: {
    accountId: string;
    keyAlgorithm: string;
  };
}

export interface PamAccountCredentialsViewEvent {
  type: EventType.PAM_ACCOUNT_CREDENTIALS_VIEW;
  metadata: {
    accountId: string;
    accountName: string;
    accountType: string;
    folderId?: string | null;
    folderName?: string | null;
    reason?: string | null;
    grantExpiresAt?: string | null;
  };
}

export interface PamDiscoverySourceCreateEvent {
  type: EventType.PAM_DISCOVERY_SOURCE_CREATE;
  metadata: { sourceId: string; discoveryType: string; name: string };
}

export interface PamDiscoverySourceUpdateEvent {
  type: EventType.PAM_DISCOVERY_SOURCE_UPDATE;
  metadata: { sourceId: string; discoveryType: string };
}

export interface PamDiscoverySourceDeleteEvent {
  type: EventType.PAM_DISCOVERY_SOURCE_DELETE;
  metadata: { sourceId: string; discoveryType: string };
}

export interface PamDiscoveryScanEvent {
  type: EventType.PAM_DISCOVERY_SCAN;
  metadata: {
    sourceId: string;
    discoveryType: string;
    runId?: string;
    status?: string;
    triggeredBy?: string;
    discoveredCount?: number;
    newCount?: number;
    errorMessage?: string;
  };
}

export interface PamDiscoveredAccountImportEvent {
  type: EventType.PAM_DISCOVERED_ACCOUNT_IMPORT;
  metadata: {
    sourceId: string;
    folderId: string;
    importedCount: number;
    importedAccounts: { discoveredAccountId: string; accountId?: string; name?: string }[];
  };
}

export interface PamAccountHeartbeatEvent {
  type: EventType.PAM_ACCOUNT_HEARTBEAT;
  metadata: {
    accountId: string;
    accountName: string;
    accountType: string;
    heartbeatStatus: string;
    manual: boolean;
    message?: string;
  };
}

export interface PamAccountRotateCredentialsEvent {
  type: EventType.PAM_ACCOUNT_ROTATE_CREDENTIALS;
  metadata: {
    accountId: string;
    accountName: string;
    accountType: string;
    rotationStatus: string;
    manual: boolean;
    rotationAccountId?: string | null;
    rotationAccountName?: string | null;
    message?: string;
  };
}

export interface PamAccountSetRotationAccountEvent {
  type: EventType.PAM_ACCOUNT_SET_ROTATION_ACCOUNT;
  metadata: {
    accountId: string;
    accountName: string;
    rotationAccountId: string | null;
    rotationAccountName: string | null;
  };
}

export interface PamAccessRequestCreateEvent {
  type: EventType.PAM_ACCESS_REQUEST_CREATE;
  metadata: {
    requestId: string;
    accountId: string;
    accountName?: string;
    folderId: string;
    folderName?: string;
    requesterName?: string;
    requesterEmail?: string;
    duration: string;
    accessType: string;
    reason?: string;
  };
}

export interface PamAccessRequestReviewEvent {
  type: EventType.PAM_ACCESS_REQUEST_REVIEW;
  metadata: {
    requestId: string;
    accountId?: string;
    accountName?: string;
    folderId?: string;
    folderName?: string;
    requesterName?: string;
    requesterEmail?: string;
    status: string;
    comment?: string;
  };
}

export interface PamAccessGrantRevokeEvent {
  type: EventType.PAM_ACCESS_GRANT_REVOKE;
  metadata: {
    requestId: string;
    grantId: string;
    accountId?: string;
    accountName?: string;
    folderId?: string;
    folderName?: string;
    granteeName?: string;
    granteeEmail?: string;
  };
}

export interface PamApprovalConfigUpdateEvent {
  type: EventType.PAM_APPROVAL_CONFIG_UPDATE;
  metadata: {
    folderId: string;
    policyId: string | null;
    stepCount: number;
    notificationConfigCount?: number;
    breakGlassUserCount?: number;
    autoApprovalRuleCount?: number;
    emailApproversOnRequest?: boolean;
  };
}

export interface PamAccessPolicyBypassedEvent {
  type: EventType.PAM_ACCESS_POLICY_BYPASSED;
  metadata: {
    policyType: string;
    policyId: string | null;
    policyName?: string;
    requestId: string;
    grantId: string;
    granteeUserId: string;
    granteeName?: string;
    granteeEmail?: string;
    accountId?: string;
    folderId?: string;
    folderName?: string;
    resourceName?: string;
    accountName?: string;
    accessDuration: string;
    bypassReason: string;
    approverCount: number;
  };
}

export interface PamAccessRequestAutoApprovedEvent {
  type: EventType.PAM_ACCESS_REQUEST_AUTO_APPROVED;
  metadata: {
    approvalRequestId: string;
    grantId?: string;
    accountId?: string;
    accountName?: string;
    folderId?: string;
    folderName?: string;
    requesterName?: string;
    requesterEmail?: string;
    duration?: string;
    accessType: string;
  } & TAutoApprovalAuditMetadata;
}

export type TPamAuditLogEvent =
  | PamSessionStartEvent
  | PamSessionEndEvent
  | PamSessionTerminateEvent
  | PamSessionChunkUploadEvent
  | PamSessionUploadTokenInvalidEvent
  | PamAccountTemplateCreateEvent
  | PamAccountTemplateUpdateEvent
  | PamAccountTemplateDeleteEvent
  | PamFolderCreateEvent
  | PamFolderUpdateEvent
  | PamFolderDeleteEvent
  | OrgAdminAccessPamFolderEvent
  | PamProductMemberAddEvent
  | PamProductMemberUpdateEvent
  | PamProductMemberRemoveEvent
  | PamFolderMemberAddEvent
  | PamFolderMemberUpdateEvent
  | PamFolderMemberRemoveEvent
  | PamAccountMemberAddEvent
  | PamAccountMemberUpdateEvent
  | PamAccountMemberRemoveEvent
  | PamAccountAccessEvent
  | PamWebAccessSessionTicketCreatedEvent
  | PamAccountCreateEvent
  | PamAccountUpdateEvent
  | PamAccountDeleteEvent
  | PamAccountSshCaCreateEvent
  | PamAccountCredentialsViewEvent
  | PamDiscoverySourceCreateEvent
  | PamDiscoverySourceUpdateEvent
  | PamDiscoverySourceDeleteEvent
  | PamDiscoveryScanEvent
  | PamDiscoveredAccountImportEvent
  | PamAccountHeartbeatEvent
  | PamAccountRotateCredentialsEvent
  | PamAccountSetRotationAccountEvent
  | PamAccessRequestCreateEvent
  | PamAccessRequestReviewEvent
  | PamAccessGrantRevokeEvent
  | PamApprovalConfigUpdateEvent
  | PamAccessPolicyBypassedEvent
  | PamAccessRequestAutoApprovedEvent;
