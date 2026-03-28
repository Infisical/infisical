import { IdentityAuthMethod } from "@app/db/schemas";
import {
  AcmeAccountActor,
  AcmeProfileActor,
  EstAccountActor,
  IdentityActor,
  KmipClientActor,
  PlatformActor,
  ScepAccountActor,
  ScimClientActor,
  ServiceActor,
  UnknownUserActor,
  UserActor
} from "@app/ee/services/audit-log/audit-log-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { EnforcementLevel, SecretSharingAccessType } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMethod } from "@app/services/auth/auth-type";
import { WebhookType } from "@app/services/webhook/webhook-types";

export type HubSpotSignupMethod = AuthMethod | "invite";

export enum PostHogEventTypes {
  SecretPush = "secrets pushed",
  SecretPulled = "secrets pulled",
  SecretCreated = "secrets added",
  SecretUpdated = "secrets modified",
  SecretDeleted = "secrets deleted",
  AdminInit = "admin initialization",
  UserSignedUp = "User Signed Up",
  SecretRotated = "secrets rotated",
  SecretScannerFull = "historical cloud secret scan",
  SecretScannerPush = "cloud secret scan",
  ProjectCreated = "Project Created",
  IntegrationCreated = "Integration Created",
  IntegrationSynced = "Integration Synced",
  IntegrationDeleted = "Integration Deleted",
  MachineIdentityCreated = "Machine Identity Created",
  MachineIdentityUpdated = "Machine Identity Updated",
  MachineIdentityDeleted = "Machine Identity Deleted",
  MachineIdentityLogin = "Machine Identity Login",
  MachineIdentityAuthMethodAttached = "Machine Identity Auth Method Attached",
  MachineIdentityAuthMethodUpdated = "Machine Identity Auth Method Updated",
  MachineIdentityAuthMethodRevoked = "Machine Identity Auth Method Revoked",
  MachineIdentityClientSecretCreated = "Machine Identity Client Secret Created",
  MachineIdentityClientSecretRevoked = "Machine Identity Client Secret Revoked",
  MachineIdentityTokenCreated = "Machine Identity Token Created",
  MachineIdentityTokenRevoked = "Machine Identity Token Revoked",
  UserOrgInvitation = "User Org Invitation",
  TelemetryInstanceStats = "Self Hosted Instance Stats",
  SecretRequestCreated = "Secret Request Created",
  SecretRequestDeleted = "Secret Request Deleted",
  SignSshKey = "Sign SSH Key",
  IssueSshCreds = "Issue SSH Credentials",
  IssueSshHostUserCert = "Issue SSH Host User Certificate",
  IssueSshHostHostCert = "Issue SSH Host Host Certificate",
  SignCert = "Sign PKI Certificate",
  IssueCert = "Issue PKI Certificate",
  InvalidateCache = "Invalidate Cache",
  NotificationUpdated = "Notification Updated",
  SecretApprovalPolicyCreated = "Secret Approval Policy Created",
  SecretApprovalPolicyDeleted = "Secret Approval Policy Deleted",
  SecretApprovalRequestSubmitted = "Secret Approval Request Submitted",
  SecretApprovalRequestReviewed = "Secret Approval Request Reviewed",
  SecretApprovalRequestStatusChanged = "Secret Approval Request Status Changed",
  SecretApprovalRequestMerged = "Secret Approval Request Merged",
  AccessApprovalPolicyCreated = "Access Approval Policy Created",
  AccessApprovalPolicyDeleted = "Access Approval Policy Deleted",
  AccessApprovalRequestCreated = "Access Approval Request Created",
  AccessApprovalRequestReviewed = "Access Approval Request Reviewed",
  SecretSyncCreated = "Secret Sync Created",
  SecretSyncDeleted = "Secret Sync Deleted",
  DynamicSecretCreated = "Dynamic Secret Created",
  DynamicSecretDeleted = "Dynamic Secret Deleted",
  DynamicSecretLeaseCreated = "Dynamic Secret Lease Created",
  DynamicSecretLeaseRenewed = "Dynamic Secret Lease Renewed",
  SecretFolderCreated = "Secret Folder Created",
  SecretImportCreated = "Secret Import Created",
  SecretShared = "Secret Shared",
  SharedSecretViewed = "Shared Secret Viewed",
  SecretRollbackPerformed = "Secret Rollback Performed",
  WebhookCreated = "Webhook Created",
  SecretReminderCreated = "Secret Reminder Created",
  EnvironmentCreated = "Environment Created",
  SSOConfigured = "SSO Configured",
  AppConnectionCreated = "App Connection Created",
  AppConnectionDeleted = "App Connection Deleted",
  SecretRotationV2Created = "Secret Rotation V2 Created",
  SecretRotationV2Deleted = "Secret Rotation V2 Deleted",
  SecretRotationV2Executed = "Secret Rotation V2 Executed",
  GatewayCertExchanged = "Gateway Cert Exchanged"
}

export type TSecretModifiedEvent = {
  event:
    | PostHogEventTypes.SecretPush
    | PostHogEventTypes.SecretRotated
    | PostHogEventTypes.SecretPulled
    | PostHogEventTypes.SecretCreated
    | PostHogEventTypes.SecretUpdated
    | PostHogEventTypes.SecretDeleted;
  properties: {
    numberOfSecrets: number;
    environment: string;
    projectId: string;
    secretPath: string;
    channel?: string;
    userAgent?: string;
    actorType?: string;
    actor?:
      | UserActor
      | IdentityActor
      | ServiceActor
      | ScimClientActor
      | PlatformActor
      | UnknownUserActor
      | AcmeAccountActor
      | AcmeProfileActor
      | KmipClientActor
      | EstAccountActor
      | ScepAccountActor;
  };
};

export type TAdminInitEvent = {
  event: PostHogEventTypes.AdminInit;
  properties: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
  };
};

export type TUserSignedUpEvent = {
  event: PostHogEventTypes.UserSignedUp;
  properties: {
    username: string;
    email: string;
    attributionSource?: string;
  };
};

export type TSecretScannerEvent = {
  event: PostHogEventTypes.SecretScannerFull | PostHogEventTypes.SecretScannerPush;
  properties: {
    numberOfRisks: number;
  };
};

export type TProjectCreateEvent = {
  event: PostHogEventTypes.ProjectCreated;
  properties: {
    name: string;
    orgId: string;
  };
};

export type TMachineIdentityCreatedEvent = {
  event: PostHogEventTypes.MachineIdentityCreated;
  properties: {
    name: string;
    hasDeleteProtection: boolean;
    orgId: string;
    identityId: string;
  };
};

export type TMachineIdentityUpdatedEvent = {
  event: PostHogEventTypes.MachineIdentityUpdated;
  properties: {
    identityId: string;
    orgId: string;
    name: string;
    hasDeleteProtection: boolean;
  };
};

export type TMachineIdentityDeletedEvent = {
  event: PostHogEventTypes.MachineIdentityDeleted;
  properties: {
    identityId: string;
    orgId: string;
  };
};

export type TMachineIdentityLoginEvent = {
  event: PostHogEventTypes.MachineIdentityLogin;
  properties: {
    identityId: string;
    orgId: string;
    authMethod: IdentityAuthMethod;
  };
};

export type TMachineIdentityAuthMethodEvent = {
  event:
    | PostHogEventTypes.MachineIdentityAuthMethodAttached
    | PostHogEventTypes.MachineIdentityAuthMethodUpdated
    | PostHogEventTypes.MachineIdentityAuthMethodRevoked;
  properties: {
    identityId: string;
    orgId: string;
    authMethod: IdentityAuthMethod;
  };
};

export type TMachineIdentityClientSecretEvent = {
  event: PostHogEventTypes.MachineIdentityClientSecretCreated | PostHogEventTypes.MachineIdentityClientSecretRevoked;
  properties: {
    identityId: string;
    orgId: string;
  };
};

export type TMachineIdentityTokenEvent = {
  event: PostHogEventTypes.MachineIdentityTokenCreated | PostHogEventTypes.MachineIdentityTokenRevoked;
  properties: {
    identityId: string;
    orgId: string;
  };
};

export type TIntegrationCreatedEvent = {
  event: PostHogEventTypes.IntegrationCreated;
  properties: {
    projectId: string;
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
};

export type TIntegrationSyncedEvent = {
  event: PostHogEventTypes.IntegrationSynced;
  properties: {
    projectId: string;
    integrationId: string;
    integration: string;
    environment: string;
    secretPath: string;
    isManualSync: boolean;
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
};

export type TIntegrationDeletedEvent = {
  event: PostHogEventTypes.IntegrationDeleted;
  properties: {
    projectId: string;
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
};

export type TUserOrgInvitedEvent = {
  event: PostHogEventTypes.UserOrgInvitation;
  properties: {
    inviteeEmails: string[];
    projectIds?: string[];
    organizationRoleSlug?: string;
  };
};

export type TTelemetryInstanceStatsEvent = {
  event: PostHogEventTypes.TelemetryInstanceStats;
  properties: {
    users: number;
    identities: number;
    projects: number;
    secrets: number;
    organizations: number;
    organizationNames: number;
    numberOfSecretOperationsMade: number;
    numberOfSecretProcessed: number;
  };
};

export type TSecretRequestCreatedEvent = {
  event: PostHogEventTypes.SecretRequestCreated;
  properties: {
    secretRequestId: string;
    organizationId: string;
    secretRequestName?: string;
  };
};

export type TSecretRequestDeletedEvent = {
  event: PostHogEventTypes.SecretRequestDeleted;
  properties: {
    secretRequestId: string;
    organizationId: string;
  };
};

export type TSignSshKeyEvent = {
  event: PostHogEventTypes.SignSshKey;
  properties: {
    certificateTemplateId: string;
    principals: string[];
    userAgent?: string;
  };
};

export type TIssueSshCredsEvent = {
  event: PostHogEventTypes.IssueSshCreds;
  properties: {
    certificateTemplateId: string;
    principals: string[];
    userAgent?: string;
  };
};

export type TIssueSshHostUserCertEvent = {
  event: PostHogEventTypes.IssueSshHostUserCert;
  properties: {
    sshHostId: string;
    hostname: string;
    principals: string[];
    userAgent?: string;
  };
};

export type TIssueSshHostHostCertEvent = {
  event: PostHogEventTypes.IssueSshHostHostCert;
  properties: {
    sshHostId: string;
    hostname: string;
    principals: string[];
    userAgent?: string;
  };
};

export type TSignCertificateEvent = {
  event: PostHogEventTypes.SignCert;
  properties: {
    caId?: string;
    certificateTemplateId?: string;
    subscriberId?: string;
    commonName: string;
    userAgent?: string;
  };
};

export type TIssueCertificateEvent = {
  event: PostHogEventTypes.IssueCert;
  properties: {
    caId?: string;
    certificateTemplateId?: string;
    subscriberId?: string;
    commonName: string;
    userAgent?: string;
  };
};

export type TInvalidateCacheEvent = {
  event: PostHogEventTypes.InvalidateCache;
  properties: {
    userAgent?: string;
  };
};

export type TNotificationUpdatedEvent = {
  event: PostHogEventTypes.NotificationUpdated;
  properties: {
    notificationId: string;
    isRead?: boolean;
  };
};

export type TSecretFolderCreatedEvent = {
  event: PostHogEventTypes.SecretFolderCreated;
  properties: {
    projectId: string;
    environment: string;
    folderPath?: string;
    folderId?: string;
    folderName?: string;
  };
};

export type TSecretImportCreatedEvent = {
  event: PostHogEventTypes.SecretImportCreated;
  properties: {
    projectId: string;
    importFromEnvironment: string;
    importFromSecretPath: string;
    importToEnvironment: string;
    importToSecretPath: string;
  };
};

export type TSecretSharedEvent = {
  event: PostHogEventTypes.SecretShared;
  properties: {
    accessType: SecretSharingAccessType;
    expiresAt: string;
    hasPassword: boolean;
  };
};

export type TSharedSecretViewedEvent = {
  event: PostHogEventTypes.SharedSecretViewed;
  properties: {
    sharedSecretId: string;
    accessType: SecretSharingAccessType;
  };
};

export type TSecretRollbackPerformedEvent = {
  event: PostHogEventTypes.SecretRollbackPerformed;
  properties: {
    projectId: string;
    environment: string;
    commitId: string;
    deepRollback: boolean;
    totalChanges: number;
  };
};

export type TWebhookCreatedEvent = {
  event: PostHogEventTypes.WebhookCreated;
  properties: {
    projectId: string;
    environment: string;
    webhookId: string;
    type: WebhookType;
  };
};

export type TSecretReminderCreatedEvent = {
  event: PostHogEventTypes.SecretReminderCreated;
  properties: {
    secretId: string;
    reminderRepeatDays?: number | null;
    hasNote: boolean;
    isOneTime: boolean;
  };
};

export type TEnvironmentCreatedEvent = {
  event: PostHogEventTypes.EnvironmentCreated;
  properties: {
    projectId: string;
    environmentName: string;
    environmentSlug: string;
  };
};

export type TSecretApprovalPolicyCreatedEvent = {
  event: PostHogEventTypes.SecretApprovalPolicyCreated;
  properties: {
    policyId: string;
    projectId: string;
    environments: string[];
    secretPath: string;
    approvals: number;
    enforcementLevel: EnforcementLevel;
  };
};

export type TSecretApprovalPolicyDeletedEvent = {
  event: PostHogEventTypes.SecretApprovalPolicyDeleted;
  properties: {
    policyId: string;
    projectId: string;
  };
};

export type TSecretApprovalRequestSubmittedEvent = {
  event: PostHogEventTypes.SecretApprovalRequestSubmitted;
  properties: {
    requestId: string;
    policyId: string;
    projectId: string;
    environment: string;
    secretPath: string;
    numberOfCommits: number;
  };
};

export type TSecretApprovalRequestReviewedEvent = {
  event: PostHogEventTypes.SecretApprovalRequestReviewed;
  properties: {
    requestId: string;
    projectId: string;
    reviewStatus: string;
  };
};

export type TSecretApprovalRequestStatusChangedEvent = {
  event: PostHogEventTypes.SecretApprovalRequestStatusChanged;
  properties: {
    requestId: string;
    projectId: string;
    status: string;
  };
};

export type TSecretApprovalRequestMergedEvent = {
  event: PostHogEventTypes.SecretApprovalRequestMerged;
  properties: {
    requestId: string;
    projectId: string;
    requestSlug: string;
  };
};

export type TAccessApprovalPolicyCreatedEvent = {
  event: PostHogEventTypes.AccessApprovalPolicyCreated;
  properties: {
    policyId: string;
    projectId: string;
    environments: string[];
    secretPath: string;
    approvals: number;
    enforcementLevel: EnforcementLevel;
  };
};

export type TAccessApprovalPolicyDeletedEvent = {
  event: PostHogEventTypes.AccessApprovalPolicyDeleted;
  properties: {
    policyId: string;
    projectId: string;
  };
};

export type TAccessApprovalRequestCreatedEvent = {
  event: PostHogEventTypes.AccessApprovalRequestCreated;
  properties: {
    requestId: string;
    projectId: string;
    isTemporary: boolean;
    temporaryRange?: string;
  };
};

export type TAccessApprovalRequestReviewedEvent = {
  event: PostHogEventTypes.AccessApprovalRequestReviewed;
  properties: {
    requestId: string;
    projectId: string;
    reviewStatus: string;
  };
};

export type TSecretSyncCreatedEvent = {
  event: PostHogEventTypes.SecretSyncCreated;
  properties: {
    syncDestination: string;
    syncId: string;
    projectId: string;
    environment: string;
    secretPath: string;
    isAutoSyncEnabled: boolean;
  };
};

export type TSecretSyncDeletedEvent = {
  event: PostHogEventTypes.SecretSyncDeleted;
  properties: {
    syncDestination: string;
    syncId: string;
    projectId: string;
    environment: string;
    secretPath: string;
    removeSecrets: boolean;
  };
};

export type TDynamicSecretCreatedEvent = {
  event: PostHogEventTypes.DynamicSecretCreated;
  properties: {
    provider: string;
    projectId: string;
    environment: string;
    secretPath: string;
    defaultTTL: string;
    maxTTL?: string | null;
    hasGateway: boolean;
  };
};

export type TDynamicSecretDeletedEvent = {
  event: PostHogEventTypes.DynamicSecretDeleted;
  properties: {
    provider: string;
    projectId: string;
    environment: string;
    secretPath: string;
    isForced: boolean;
  };
};

export type TDynamicSecretLeaseCreatedEvent = {
  event: PostHogEventTypes.DynamicSecretLeaseCreated;
  properties: {
    provider: string;
    projectId: string;
    environment: string;
    secretPath: string;
    dynamicSecretId: string;
    ttl: string;
  };
};

export type TDynamicSecretLeaseRenewedEvent = {
  event: PostHogEventTypes.DynamicSecretLeaseRenewed;
  properties: {
    provider: string;
    projectId: string;
    environment: string;
    secretPath: string;
    dynamicSecretId: string;
    ttl: string;
  };
};

export type TSSOConfiguredEvent = {
  event: PostHogEventTypes.SSOConfigured;
  properties: {
    provider: string;
    action: "create" | "update";
  };
};

export type TAppConnectionCreatedEvent = {
  event: PostHogEventTypes.AppConnectionCreated;
  properties: {
    appConnectionId: string;
    app: AppConnection;
    method: string;
  };
};

export type TAppConnectionDeletedEvent = {
  event: PostHogEventTypes.AppConnectionDeleted;
  properties: {
    appConnectionId: string;
    app: AppConnection;
  };
};

export type TSecretRotationV2CreatedEvent = {
  event: PostHogEventTypes.SecretRotationV2Created;
  properties: {
    rotationId: string;
    type: SecretRotation;
    projectId: string;
    environment: string;
    secretPath: string;
  };
};

export type TSecretRotationV2DeletedEvent = {
  event: PostHogEventTypes.SecretRotationV2Deleted;
  properties: {
    rotationId: string;
    type: SecretRotation;
    projectId: string;
    environment: string;
    secretPath: string;
  };
};

export type TSecretRotationV2ExecutedEvent = {
  event: PostHogEventTypes.SecretRotationV2Executed;
  properties: {
    rotationId: string;
    type: SecretRotation;
    projectId: string;
    environment: string;
    secretPath: string;
  };
};

export type TGatewayCertExchangedEvent = {
  event: PostHogEventTypes.GatewayCertExchanged;
  properties: {
    certificateSerialNumber: string;
    identityId: string;
  };
};

export type TPostHogEvent = { distinctId: string; organizationId?: string; organizationName?: string } & (
  | TSecretModifiedEvent
  | TAdminInitEvent
  | TUserSignedUpEvent
  | TSecretScannerEvent
  | TUserOrgInvitedEvent
  | TMachineIdentityCreatedEvent
  | TMachineIdentityUpdatedEvent
  | TMachineIdentityDeletedEvent
  | TMachineIdentityLoginEvent
  | TMachineIdentityAuthMethodEvent
  | TMachineIdentityClientSecretEvent
  | TMachineIdentityTokenEvent
  | TIntegrationCreatedEvent
  | TIntegrationSyncedEvent
  | TIntegrationDeletedEvent
  | TProjectCreateEvent
  | TTelemetryInstanceStatsEvent
  | TSecretRequestCreatedEvent
  | TSecretRequestDeletedEvent
  | TSignSshKeyEvent
  | TIssueSshCredsEvent
  | TIssueSshHostUserCertEvent
  | TIssueSshHostHostCertEvent
  | TSignCertificateEvent
  | TIssueCertificateEvent
  | TInvalidateCacheEvent
  | TNotificationUpdatedEvent
  | TSecretApprovalPolicyCreatedEvent
  | TSecretApprovalPolicyDeletedEvent
  | TSecretApprovalRequestSubmittedEvent
  | TSecretApprovalRequestReviewedEvent
  | TSecretApprovalRequestStatusChangedEvent
  | TSecretApprovalRequestMergedEvent
  | TAccessApprovalPolicyCreatedEvent
  | TAccessApprovalPolicyDeletedEvent
  | TAccessApprovalRequestCreatedEvent
  | TAccessApprovalRequestReviewedEvent
  | TSecretSyncCreatedEvent
  | TSecretSyncDeletedEvent
  | TDynamicSecretCreatedEvent
  | TDynamicSecretDeletedEvent
  | TDynamicSecretLeaseCreatedEvent
  | TDynamicSecretLeaseRenewedEvent
  | TSecretFolderCreatedEvent
  | TSecretImportCreatedEvent
  | TSecretSharedEvent
  | TSharedSecretViewedEvent
  | TSecretRollbackPerformedEvent
  | TWebhookCreatedEvent
  | TSecretReminderCreatedEvent
  | TEnvironmentCreatedEvent
  | TSSOConfiguredEvent
  | TAppConnectionCreatedEvent
  | TAppConnectionDeletedEvent
  | TSecretRotationV2CreatedEvent
  | TSecretRotationV2DeletedEvent
  | TSecretRotationV2ExecutedEvent
  | TGatewayCertExchangedEvent
);
