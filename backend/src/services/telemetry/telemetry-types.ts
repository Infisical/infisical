import { IdentityAuthMethod, ProjectType } from "@app/db/schemas";
import {
  AcmeAccountActor,
  AcmeProfileActor,
  EstAccountActor,
  GatewayActor,
  IdentityActor,
  KmipClientActor,
  KmipServerActor,
  PlatformActor,
  RelayActor,
  ScepAccountActor,
  ScimClientActor,
  ServiceActor,
  UnknownUserActor,
  UserActor
} from "@app/ee/services/audit-log/audit-log-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
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
  UserLoginV2 = "User Login V2",
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
  SecretRevertPerformed = "Secret Revert Performed",
  WebhookCreated = "Webhook Created",
  SecretReminderCreated = "Secret Reminder Created",
  EnvironmentCreated = "Environment Created",
  SSOConfigured = "SSO Configured",
  AppConnectionCreated = "App Connection Created",
  AppConnectionDeleted = "App Connection Deleted",
  SecretRotationV2Created = "Secret Rotation V2 Created",
  SecretRotationV2Deleted = "Secret Rotation V2 Deleted",
  SecretRotationV2Executed = "Secret Rotation V2 Executed",
  GatewayCertExchanged = "Gateway Cert Exchanged",
  GatewayUpdated = "Gateway Updated",
  GatewayDeleted = "Gateway Deleted",
  PamAccountTemplateCreated = "PAM Account Template Created",
  PamAccountTemplateUpdated = "PAM Account Template Updated",
  PamAccountTemplateDeleted = "PAM Account Template Deleted",
  PamFolderCreated = "PAM Folder Created",
  PamFolderUpdated = "PAM Folder Updated",
  PamFolderDeleted = "PAM Folder Deleted",
  PamAccountCreated = "PAM Account Created",
  PamAccountUpdated = "PAM Account Updated",
  PamAccountDeleted = "PAM Account Deleted",
  PamAccountAccessed = "PAM Account Accessed",
  PamDiscoverySourceCreated = "PAM Discovery Source Created",
  PamDiscoverySourceUpdated = "PAM Discovery Source Updated",
  PamDiscoverySourceDeleted = "PAM Discovery Source Deleted",
  PamDiscoveryScanTriggered = "PAM Discovery Scan Triggered",
  PamDiscoveredAccountsImported = "PAM Discovered Accounts Imported",
  PamSessionStarted = "PAM Session Started",
  PamSessionEnded = "PAM Session Ended",
  PamSessionTerminated = "PAM Session Terminated",
  PamProductMemberAdded = "PAM Product Member Added",
  PamProductMemberUpdated = "PAM Product Member Updated",
  PamProductMemberRemoved = "PAM Product Member Removed",
  PamFolderMemberAdded = "PAM Folder Member Added",
  PamFolderMemberUpdated = "PAM Folder Member Updated",
  PamFolderMemberRemoved = "PAM Folder Member Removed",
  PamAccountMemberAdded = "PAM Account Member Added",
  PamAccountMemberUpdated = "PAM Account Member Updated",
  PamAccountMemberRemoved = "PAM Account Member Removed",

  ResourceAuthMethodLogin = "Resource Auth Method Login",
  ResourceAuthMethodUpdated = "Resource Auth Method Updated",

  HoneyTokenCreated = "Honey Token Created",
  HoneyTokenUpdated = "Honey Token Updated",
  HoneyTokenRevoked = "Honey Token Revoked",
  HoneyTokenReset = "Honey Token Reset",
  HoneyTokenTriggered = "Honey Token Triggered",

  // PKI / Certificate Manager events
  CaCreated = "CA Created",
  CaDeleted = "CA Deleted",
  CaRenewed = "CA Renewed",
  CertificatePolicyCreated = "Certificate Policy Created",
  CertificatePolicyDeleted = "Certificate Policy Deleted",
  CertificateProfileCreated = "Certificate Profile Created",
  CertificateProfileDeleted = "Certificate Profile Deleted",
  PkiApplicationCreated = "PKI Application Created",
  PkiApplicationDeleted = "PKI Application Deleted",
  PkiApplicationMemberAdded = "PKI Application Member Added",
  PkiApplicationProfileAttached = "PKI Application Profile Attached",
  EnrollmentMethodConfigured = "Enrollment Method Configured",
  EnrollmentMethodRemoved = "Enrollment Method Removed",
  CertificateRevoked = "Certificate Revoked",
  CertificateRenewed = "Certificate Renewed",
  CertificateAutoRenewalFailed = "Certificate Auto-Renewal Failed",
  CertificateDeleted = "Certificate Deleted",
  CertificateExported = "Certificate Exported",
  CertificateRequestCreated = "Certificate Request Created",
  PkiSyncCreated = "PKI Sync Created",
  PkiSyncDeleted = "PKI Sync Deleted",
  PkiSyncExecuted = "PKI Sync Executed",
  PkiAlertCreated = "PKI Alert Created",
  PkiAlertDeleted = "PKI Alert Deleted",
  PkiApprovalPolicyCreated = "PKI Approval Policy Created",
  PkiApprovalRequestReviewed = "PKI Approval Request Reviewed",
  PkiDiscoveryCreated = "PKI Discovery Created",
  PkiDiscoveryScanTriggered = "PKI Discovery Scan Triggered",
  PkiDiscoveryDeleted = "PKI Discovery Deleted",
  SignerCreated = "Signer Created",
  SignerDeleted = "Signer Deleted",
  CodeSigningOperation = "Code Signing Operation",
  CertManagerIdentityAdded = "Cert Manager Identity Added",
  CertificateCleanupConfigured = "Certificate Cleanup Configured",
  CertificateCleanupCompleted = "Certificate Cleanup Completed",

  CustomRoleCreated = "Custom Role Created",
  CustomRoleUpdated = "Custom Role Updated",
  CustomRoleDeleted = "Custom Role Deleted",
  OrgMembershipRoleUpdated = "Org Membership Role Updated",
  OrgMembershipDeleted = "Org Membership Deleted",
  ProjectMembershipCreated = "Project Membership Created",
  ProjectMembershipRoleUpdated = "Project Membership Role Updated",
  ProjectMembershipDeleted = "Project Membership Deleted",
  OrganizationCreated = "Organization Created",
  SubOrganizationCreated = "Sub Organization Created",

  // CMEK
  CmekCreated = "CMEK Created",
  CmekEncrypt = "CMEK Encrypt",
  CmekDecrypt = "CMEK Decrypt",

  // Secret Scanning v2
  SecretScanningDataSourceCreated = "Secret Scanning Data Source Created",
  SecretScanningScanCompleted = "Secret Scanning Scan Completed",
  SecretScanningFindingResolved = "Secret Scanning Finding Resolved",

  // Groups
  GroupCreated = "Group Created",
  GroupUpdated = "Group Updated",
  GroupDeleted = "Group Deleted",
  GroupMemberAdded = "Group Member Added",
  GroupMemberRemoved = "Group Member Removed",
  GroupAddedToProject = "Group Added to Project",

  // Secret Tags
  SecretTagCreated = "Secret Tag Created",
  SecretTagUpdated = "Secret Tag Updated",
  SecretTagDeleted = "Secret Tag Deleted",

  // Project Templates
  ProjectTemplateCreated = "Project Template Created",
  ProjectTemplateUpdated = "Project Template Updated",
  ProjectTemplateDeleted = "Project Template Deleted",
  ProjectTemplateApplied = "Project Template Applied",

  // KMIP
  KmipClientCreated = "KMIP Client Created",
  KmipClientUpdated = "KMIP Client Updated",
  KmipClientDeleted = "KMIP Client Deleted",
  KmipOperation = "KMIP Operation",

  // Audit Log Streams
  AuditLogStreamCreated = "Audit Log Stream Created",
  AuditLogStreamUpdated = "Audit Log Stream Updated",
  AuditLogStreamDeleted = "Audit Log Stream Deleted",

  // Email Domains
  EmailDomainCreated = "Email Domain Created",
  EmailDomainVerified = "Email Domain Verified",
  EmailDomainDeleted = "Email Domain Deleted",

  // External Migrations
  ExternalMigrationCreated = "External Migration Created",

  // GitHub Org Sync
  GitHubOrgSyncConfigured = "GitHub Org Sync Configured",
  GitHubOrgSyncUpdated = "GitHub Org Sync Updated",
  GitHubOrgSyncDeleted = "GitHub Org Sync Deleted",
  GitHubOrgSyncExecuted = "GitHub Org Sync Executed",

  // Secret Validation Rules
  SecretValidationRuleCreated = "Secret Validation Rule Created",
  SecretValidationRuleUpdated = "Secret Validation Rule Updated",
  SecretValidationRuleDeleted = "Secret Validation Rule Deleted",

  // Lifecycle gaps
  SecretSyncFailed = "Secret Sync Failed",
  SecretFolderUpdated = "Secret Folder Updated",
  SecretFolderDeleted = "Secret Folder Deleted",
  SecretImportUpdated = "Secret Import Updated",
  SecretImportDeleted = "Secret Import Deleted",
  WebhookUpdated = "Webhook Updated",
  WebhookDeleted = "Webhook Deleted",
  EnvironmentUpdated = "Environment Updated",
  EnvironmentDeleted = "Environment Deleted",
  AppConnectionUpdated = "App Connection Updated",
  DynamicSecretUpdated = "Dynamic Secret Updated",
  DynamicSecretLeaseRevoked = "Dynamic Secret Lease Revoked",
  SecretApprovalPolicyUpdated = "Secret Approval Policy Updated",
  AccessApprovalPolicyUpdated = "Access Approval Policy Updated",
  SecretRotationV2Failed = "Secret Rotation V2 Failed"
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
      | ScepAccountActor
      | GatewayActor
      | RelayActor
      | KmipServerActor;
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
    signupMethod?: string;
  };
};

export type TOrganizationCreatedEvent = {
  event: PostHogEventTypes.OrganizationCreated;
  properties: {
    name: string;
  };
};

export type TSubOrganizationCreatedEvent = {
  event: PostHogEventTypes.SubOrganizationCreated;
  properties: {
    name: string;
    parentOrgId: string;
  };
};

export type TUserLoginV2Event = {
  event: PostHogEventTypes.UserLoginV2;
  properties: {
    email: string;
    channel: string;
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
    projectType?: ProjectType;
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
    organizationNames: string[];
    numberOfSecretOperationsMade: number;
    numberOfSecretProcessed: number;
    environments: number;
    secretSyncs: number;
    appConnections: number;
    integrations: number;
    certificateAuthorities: number;
    certificates: number;
    dynamicSecrets: number;
    identityAuthMethods: number;
    identityAuthMethodBreakdown: Record<string, number>;
    groups: number;
    secretApprovalPolicies: number;
    activeGateways: number;
    samlConfigs: number;
    oidcConfigs: number;
    ldapConfigs: number;
    scimTokens: number;
    auditLogStreams: number;
    secretRotations: number;
    webhooks: number;
    customProjectRoles: number;
    customOrgRoles: number;
    kmipClients: number;
    sshHosts: number;
    sshCertificateAuthorities: number;
    sshCertificates: number;
    pamResources: number;
    pamAccounts: number;
    accessApprovalPolicies: number;
    honeyTokens: number;
    integrationBreakdown: Record<string, number>;
    projectTypeBreakdown: Record<string, number>;
    secretSyncBreakdown: Record<string, number>;
    organizationBreakdown: { orgId: string; name: string; users: number; projects: number }[];
    infisicalVersion?: string;
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

export type TSecretRevertPerformedEvent = {
  event: PostHogEventTypes.SecretRevertPerformed;
  properties: {
    projectId: string;
    commitId: string;
    changesReverted?: number;
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
    eventTypes?: string[];
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
    timeToMergeSeconds?: number;
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
    orgId?: string;
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
    durationMs?: number;
  };
};

export type TGatewayCertExchangedEvent = {
  event: PostHogEventTypes.GatewayCertExchanged;
  properties: {
    certificateSerialNumber: string;
    identityId: string;
    orgId?: string;
  };
};

export type TGatewayUpdatedEvent = {
  event: PostHogEventTypes.GatewayUpdated;
  properties: {
    gatewayId: string;
  };
};

export type TGatewayDeletedEvent = {
  event: PostHogEventTypes.GatewayDeleted;
  properties: {
    gatewayId: string;
  };
};

export type TPamAccountTemplateEvent = {
  event:
    | PostHogEventTypes.PamAccountTemplateCreated
    | PostHogEventTypes.PamAccountTemplateUpdated
    | PostHogEventTypes.PamAccountTemplateDeleted;
  properties: {
    accountType: string;
    orgId: string;
  };
};

export type TPamFolderEvent = {
  event: PostHogEventTypes.PamFolderCreated | PostHogEventTypes.PamFolderUpdated | PostHogEventTypes.PamFolderDeleted;
  properties: {
    orgId: string;
  };
};

export type TPamAccountEvent = {
  event:
    | PostHogEventTypes.PamAccountCreated
    | PostHogEventTypes.PamAccountUpdated
    | PostHogEventTypes.PamAccountDeleted;
  properties: {
    accountType: string;
    orgId: string;
  };
};

export type TPamDiscoveryEvent = {
  event:
    | PostHogEventTypes.PamDiscoverySourceCreated
    | PostHogEventTypes.PamDiscoverySourceUpdated
    | PostHogEventTypes.PamDiscoverySourceDeleted
    | PostHogEventTypes.PamDiscoveryScanTriggered;
  properties: {
    discoveryType: string;
    orgId: string;
  };
};

export type TPamDiscoveredAccountsImportedEvent = {
  event: PostHogEventTypes.PamDiscoveredAccountsImported;
  properties: {
    orgId: string;
    importedCount: number;
  };
};

export type TPamAccountAccessedEvent = {
  event: PostHogEventTypes.PamAccountAccessed;
  properties: {
    accountType: string;
    orgId: string;
    duration: number;
  };
};

export type TPamSessionStartedEvent = {
  event: PostHogEventTypes.PamSessionStarted;
  properties: {
    accountType: string;
    orgId: string;
  };
};

export type TPamSessionEndedEvent = {
  event: PostHogEventTypes.PamSessionEnded | PostHogEventTypes.PamSessionTerminated;
  properties: {
    accountType: string;
    orgId: string;
    durationMs?: number;
  };
};

export type TPamProductMemberEvent = {
  event:
    | PostHogEventTypes.PamProductMemberAdded
    | PostHogEventTypes.PamProductMemberUpdated
    | PostHogEventTypes.PamProductMemberRemoved;
  properties: {
    orgId: string;
  };
};

export type TPamFolderMemberEvent = {
  event:
    | PostHogEventTypes.PamFolderMemberAdded
    | PostHogEventTypes.PamFolderMemberUpdated
    | PostHogEventTypes.PamFolderMemberRemoved;
  properties: {
    orgId: string;
  };
};

export type TPamAccountMemberEvent = {
  event:
    | PostHogEventTypes.PamAccountMemberAdded
    | PostHogEventTypes.PamAccountMemberUpdated
    | PostHogEventTypes.PamAccountMemberRemoved;
  properties: {
    orgId: string;
  };
};

export type TResourceAuthMethodEvent = {
  event: PostHogEventTypes.ResourceAuthMethodLogin | PostHogEventTypes.ResourceAuthMethodUpdated;
  properties: {
    resourceType: "gateway";
    resourceId: string;
    orgId: string;
    method: "aws" | "token";
  };
};

export type THoneyTokenCreatedEvent = {
  event: PostHogEventTypes.HoneyTokenCreated;
  properties: {
    honeyTokenId: string;
    type: string;
    projectId: string;
    environment: string;
    secretPath: string;
  };
};

export type THoneyTokenUpdatedEvent = {
  event: PostHogEventTypes.HoneyTokenUpdated;
  properties: {
    honeyTokenId: string;
    type: string;
    projectId: string;
  };
};

export type THoneyTokenRevokedEvent = {
  event: PostHogEventTypes.HoneyTokenRevoked;
  properties: {
    honeyTokenId: string;
    type: string;
    projectId: string;
  };
};

export type THoneyTokenResetEvent = {
  event: PostHogEventTypes.HoneyTokenReset;
  properties: {
    honeyTokenId: string;
    type: string;
    projectId: string;
  };
};

export type THoneyTokenTriggeredEvent = {
  event: PostHogEventTypes.HoneyTokenTriggered;
  properties: {
    type: string;
  };
};

// PKI / Certificate Manager event types

export type TCaCreatedEvent = {
  event: PostHogEventTypes.CaCreated;
  properties: {
    caType: string;
    caKeyAlgorithm?: string;
    orgId: string;
  };
};

export type TCaDeletedEvent = {
  event: PostHogEventTypes.CaDeleted;
  properties: {
    caType: string;
    orgId: string;
  };
};

export type TCaRenewedEvent = {
  event: PostHogEventTypes.CaRenewed;
  properties: {
    caType: string;
    orgId: string;
  };
};

export type TCertificatePolicyCreatedEvent = {
  event: PostHogEventTypes.CertificatePolicyCreated;
  properties: {
    orgId: string;
  };
};

export type TCertificatePolicyDeletedEvent = {
  event: PostHogEventTypes.CertificatePolicyDeleted;
  properties: {
    orgId: string;
  };
};

export type TCertificateProfileCreatedEvent = {
  event: PostHogEventTypes.CertificateProfileCreated;
  properties: {
    orgId: string;
    issuerType: string;
  };
};

export type TCertificateProfileDeletedEvent = {
  event: PostHogEventTypes.CertificateProfileDeleted;
  properties: {
    orgId: string;
  };
};

export type TPkiApplicationCreatedEvent = {
  event: PostHogEventTypes.PkiApplicationCreated;
  properties: {
    orgId: string;
  };
};

export type TPkiApplicationDeletedEvent = {
  event: PostHogEventTypes.PkiApplicationDeleted;
  properties: {
    orgId: string;
  };
};

export type TPkiApplicationMemberAddedEvent = {
  event: PostHogEventTypes.PkiApplicationMemberAdded;
  properties: {
    orgId: string;
    applicationId: string;
    role: string;
  };
};

export type TPkiApplicationProfileAttachedEvent = {
  event: PostHogEventTypes.PkiApplicationProfileAttached;
  properties: {
    orgId: string;
    applicationId: string;
  };
};

export type TEnrollmentMethodConfiguredEvent = {
  event: PostHogEventTypes.EnrollmentMethodConfigured;
  properties: {
    orgId: string;
    enrollmentMethod: string;
  };
};

export type TEnrollmentMethodRemovedEvent = {
  event: PostHogEventTypes.EnrollmentMethodRemoved;
  properties: {
    orgId: string;
    enrollmentMethod: string;
  };
};

export type TCertificateRevokedEvent = {
  event: PostHogEventTypes.CertificateRevoked;
  properties: {
    orgId: string;
    applicationId?: string;
  };
};

export type TCertificateRenewedEvent = {
  event: PostHogEventTypes.CertificateRenewed;
  properties: {
    orgId: string;
    applicationId?: string;
    profileId?: string;
  };
};

export type TCertificateAutoRenewalFailedEvent = {
  event: PostHogEventTypes.CertificateAutoRenewalFailed;
  properties: {
    orgId: string;
    profileId?: string;
  };
};

export type TCertificateDeletedEvent = {
  event: PostHogEventTypes.CertificateDeleted;
  properties: {
    orgId: string;
    applicationId?: string;
  };
};

export type TCertificateExportedEvent = {
  event: PostHogEventTypes.CertificateExported;
  properties: {
    orgId: string;
    format?: string;
  };
};

export type TCertificateRequestCreatedEvent = {
  event: PostHogEventTypes.CertificateRequestCreated;
  properties: {
    orgId: string;
    applicationId?: string;
    profileId?: string;
  };
};

export type TPkiSyncCreatedEvent = {
  event: PostHogEventTypes.PkiSyncCreated;
  properties: {
    orgId: string;
    destination: string;
    isAutoSyncEnabled?: boolean;
  };
};

export type TPkiSyncDeletedEvent = {
  event: PostHogEventTypes.PkiSyncDeleted;
  properties: {
    orgId: string;
    destination: string;
  };
};

export type TPkiSyncExecutedEvent = {
  event: PostHogEventTypes.PkiSyncExecuted;
  properties: {
    orgId: string;
    destination: string;
    success: boolean;
  };
};

export type TPkiAlertCreatedEvent = {
  event: PostHogEventTypes.PkiAlertCreated;
  properties: {
    orgId: string;
    applicationId: string;
    alertType?: string;
  };
};

export type TPkiAlertDeletedEvent = {
  event: PostHogEventTypes.PkiAlertDeleted;
  properties: {
    orgId: string;
    applicationId: string;
  };
};

export type TPkiApprovalPolicyCreatedEvent = {
  event: PostHogEventTypes.PkiApprovalPolicyCreated;
  properties: {
    orgId: string;
    policyType: string;
  };
};

export type TPkiApprovalRequestReviewedEvent = {
  event: PostHogEventTypes.PkiApprovalRequestReviewed;
  properties: {
    orgId: string;
    decision: string;
  };
};

export type TPkiDiscoveryCreatedEvent = {
  event: PostHogEventTypes.PkiDiscoveryCreated;
  properties: {
    orgId: string;
    discoveryType: string;
  };
};

export type TPkiDiscoveryScanTriggeredEvent = {
  event: PostHogEventTypes.PkiDiscoveryScanTriggered;
  properties: {
    orgId: string;
  };
};

export type TPkiDiscoveryDeletedEvent = {
  event: PostHogEventTypes.PkiDiscoveryDeleted;
  properties: {
    orgId: string;
  };
};

export type TSignerCreatedEvent = {
  event: PostHogEventTypes.SignerCreated;
  properties: {
    orgId: string;
  };
};

export type TSignerDeletedEvent = {
  event: PostHogEventTypes.SignerDeleted;
  properties: {
    orgId: string;
  };
};

export type TCodeSigningOperationEvent = {
  event: PostHogEventTypes.CodeSigningOperation;
  properties: {
    orgId: string;
    signerId: string;
  };
};

export type TCertManagerIdentityAddedEvent = {
  event: PostHogEventTypes.CertManagerIdentityAdded;
  properties: {
    orgId: string;
    role?: string;
  };
};

export type TCertificateCleanupConfiguredEvent = {
  event: PostHogEventTypes.CertificateCleanupConfigured;
  properties: {
    orgId: string;
    isEnabled: boolean;
  };
};

export type TCertificateCleanupCompletedEvent = {
  event: PostHogEventTypes.CertificateCleanupCompleted;
  properties: {
    deletedCount: number;
    projectsProcessed: number;
  };
};

export type TCustomRoleCreatedEvent = {
  event: PostHogEventTypes.CustomRoleCreated;
  properties: {
    roleId: string;
    name: string;
    slug: string;
    scope: string;
  };
};

export type TCustomRoleUpdatedEvent = {
  event: PostHogEventTypes.CustomRoleUpdated;
  properties: {
    roleId: string;
    name?: string;
    slug?: string;
    scope: string;
    permissionsUpdated: boolean;
  };
};

export type TCustomRoleDeletedEvent = {
  event: PostHogEventTypes.CustomRoleDeleted;
  properties: {
    roleId: string;
    name: string;
    slug: string;
    scope: string;
  };
};

export type TOrgMembershipRoleUpdatedEvent = {
  event: PostHogEventTypes.OrgMembershipRoleUpdated;
  properties: {
    membershipId: string;
    newRole: string;
  };
};

export type TProjectMembershipRoleUpdatedEvent = {
  event: PostHogEventTypes.ProjectMembershipRoleUpdated;
  properties: {
    projectId: string;
    userId: string;
    roles: string[];
  };
};

export type TOrgMembershipDeletedEvent = {
  event: PostHogEventTypes.OrgMembershipDeleted;
  properties: {
    membershipIds: string[];
  };
};

export type TProjectMembershipCreatedEvent = {
  event: PostHogEventTypes.ProjectMembershipCreated;
  properties: {
    projectId: string;
    userIds: string[];
    roles: string[];
  };
};

export type TProjectMembershipDeletedEvent = {
  event: PostHogEventTypes.ProjectMembershipDeleted;
  properties: {
    projectId: string;
    userIds: string[];
  };
};

// CMEK events
export type TCmekCreatedEvent = {
  event: PostHogEventTypes.CmekCreated;
  properties: {
    keyId: string;
    projectId: string;
    encryptionAlgorithm: string;
    keyUsage: string;
  };
};

export type TCmekEncryptEvent = {
  event: PostHogEventTypes.CmekEncrypt;
  properties: {
    keyId: string;
    projectId: string;
  };
};

export type TCmekDecryptEvent = {
  event: PostHogEventTypes.CmekDecrypt;
  properties: {
    keyId: string;
    projectId: string;
  };
};

// Secret Scanning v2 events
export type TSecretScanningDataSourceCreatedEvent = {
  event: PostHogEventTypes.SecretScanningDataSourceCreated;
  properties: {
    dataSourceId: string;
    projectId: string;
    type: SecretScanningDataSource;
  };
};

export type TSecretScanningScanCompletedEvent = {
  event: PostHogEventTypes.SecretScanningScanCompleted;
  properties: {
    dataSourceId: string;
    projectId: string;
    type: SecretScanningDataSource;
    findingCount: number;
  };
};

export type TSecretScanningFindingResolvedEvent = {
  event: PostHogEventTypes.SecretScanningFindingResolved;
  properties: {
    findingId: string;
    projectId: string;
  };
};

// Group events
export type TGroupCreatedEvent = {
  event: PostHogEventTypes.GroupCreated;
  properties: {
    groupId: string;
    name: string;
  };
};

export type TGroupUpdatedEvent = {
  event: PostHogEventTypes.GroupUpdated;
  properties: {
    groupId: string;
    name: string;
  };
};

export type TGroupDeletedEvent = {
  event: PostHogEventTypes.GroupDeleted;
  properties: {
    groupId: string;
    name: string;
  };
};

export type TGroupMemberAddedEvent = {
  event: PostHogEventTypes.GroupMemberAdded;
  properties: {
    groupId: string;
    memberType: "user" | "identity";
  };
};

export type TGroupMemberRemovedEvent = {
  event: PostHogEventTypes.GroupMemberRemoved;
  properties: {
    groupId: string;
    memberType: "user" | "identity";
  };
};

export type TGroupAddedToProjectEvent = {
  event: PostHogEventTypes.GroupAddedToProject;
  properties: {
    groupId: string;
    projectId: string;
  };
};

// Secret Tag event
export type TSecretTagCreatedEvent = {
  event: PostHogEventTypes.SecretTagCreated;
  properties: {
    projectId: string;
    tagId: string;
  };
};

export type TSecretTagUpdatedEvent = {
  event: PostHogEventTypes.SecretTagUpdated;
  properties: {
    projectId: string;
    tagId: string;
  };
};

export type TSecretTagDeletedEvent = {
  event: PostHogEventTypes.SecretTagDeleted;
  properties: {
    projectId: string;
    tagId: string;
  };
};

// Project Template events
export type TProjectTemplateCreatedEvent = {
  event: PostHogEventTypes.ProjectTemplateCreated;
  properties: {
    templateId: string;
    name: string;
  };
};

export type TProjectTemplateUpdatedEvent = {
  event: PostHogEventTypes.ProjectTemplateUpdated;
  properties: {
    templateId: string;
    name: string;
  };
};

export type TProjectTemplateDeletedEvent = {
  event: PostHogEventTypes.ProjectTemplateDeleted;
  properties: {
    templateId: string;
    name: string;
  };
};

export type TProjectTemplateAppliedEvent = {
  event: PostHogEventTypes.ProjectTemplateApplied;
  properties: {
    templateId: string;
    projectId: string;
  };
};

// KMIP events
export type TKmipClientCreatedEvent = {
  event: PostHogEventTypes.KmipClientCreated;
  properties: {
    clientId: string;
    projectId: string;
  };
};

export type TKmipClientUpdatedEvent = {
  event: PostHogEventTypes.KmipClientUpdated;
  properties: {
    clientId: string;
    projectId: string;
  };
};

export type TKmipClientDeletedEvent = {
  event: PostHogEventTypes.KmipClientDeleted;
  properties: {
    clientId: string;
    projectId: string;
  };
};

export type TKmipOperationEvent = {
  event: PostHogEventTypes.KmipOperation;
  properties: {
    operationType: string;
    projectId: string;
  };
};

// Audit Log Stream event
export type TAuditLogStreamCreatedEvent = {
  event: PostHogEventTypes.AuditLogStreamCreated;
  properties: {
    streamId: string;
    destinationType: string;
  };
};

export type TAuditLogStreamUpdatedEvent = {
  event: PostHogEventTypes.AuditLogStreamUpdated;
  properties: {
    streamId: string;
    destinationType: string;
  };
};

export type TAuditLogStreamDeletedEvent = {
  event: PostHogEventTypes.AuditLogStreamDeleted;
  properties: {
    streamId: string;
    destinationType: string;
  };
};

// Email Domain event
export type TEmailDomainCreatedEvent = {
  event: PostHogEventTypes.EmailDomainCreated;
  properties: {
    emailDomainId: string;
    domain: string;
  };
};

export type TEmailDomainVerifiedEvent = {
  event: PostHogEventTypes.EmailDomainVerified;
  properties: {
    emailDomainId: string;
    domain: string;
  };
};

export type TEmailDomainDeletedEvent = {
  event: PostHogEventTypes.EmailDomainDeleted;
  properties: {
    emailDomainId: string;
    domain: string;
  };
};

// External Migration event
export type TExternalMigrationCreatedEvent = {
  event: PostHogEventTypes.ExternalMigrationCreated;
  properties: {
    sourcePlatform: string;
  };
};

// GitHub Org Sync events
export type TGitHubOrgSyncConfiguredEvent = {
  event: PostHogEventTypes.GitHubOrgSyncConfigured;
  properties: {
    githubOrgName?: string;
    isActive?: boolean;
  };
};

export type TGitHubOrgSyncUpdatedEvent = {
  event: PostHogEventTypes.GitHubOrgSyncUpdated;
  properties: {
    githubOrgName?: string;
    isActive?: boolean;
  };
};

export type TGitHubOrgSyncDeletedEvent = {
  event: PostHogEventTypes.GitHubOrgSyncDeleted;
  properties: {
    githubOrgName?: string;
  };
};

export type TGitHubOrgSyncExecutedEvent = {
  event: PostHogEventTypes.GitHubOrgSyncExecuted;
  properties: {
    totalUsers?: number;
    createdTeams?: number;
    updatedTeams?: number;
    syncDuration?: number;
  };
};

// Secret Validation Rule event
export type TSecretValidationRuleCreatedEvent = {
  event: PostHogEventTypes.SecretValidationRuleCreated;
  properties: {
    ruleId: string;
    projectId: string;
  };
};

export type TSecretValidationRuleUpdatedEvent = {
  event: PostHogEventTypes.SecretValidationRuleUpdated;
  properties: {
    ruleId: string;
    projectId: string;
  };
};

export type TSecretValidationRuleDeletedEvent = {
  event: PostHogEventTypes.SecretValidationRuleDeleted;
  properties: {
    ruleId: string;
    projectId: string;
  };
};

// Lifecycle gap events
export type TSecretSyncFailedEvent = {
  event: PostHogEventTypes.SecretSyncFailed;
  properties: {
    syncId: string;
    syncDestination: string;
    projectId: string;
  };
};

export type TSecretFolderUpdatedEvent = {
  event: PostHogEventTypes.SecretFolderUpdated;
  properties: {
    projectId: string;
    environment: string;
    folderId: string;
  };
};

export type TSecretFolderDeletedEvent = {
  event: PostHogEventTypes.SecretFolderDeleted;
  properties: {
    projectId: string;
    environment: string;
    folderId: string;
  };
};

export type TSecretImportUpdatedEvent = {
  event: PostHogEventTypes.SecretImportUpdated;
  properties: {
    projectId: string;
    importId: string;
  };
};

export type TSecretImportDeletedEvent = {
  event: PostHogEventTypes.SecretImportDeleted;
  properties: {
    projectId: string;
    importId: string;
  };
};

export type TWebhookUpdatedEvent = {
  event: PostHogEventTypes.WebhookUpdated;
  properties: {
    projectId: string;
    webhookId: string;
  };
};

export type TWebhookDeletedEvent = {
  event: PostHogEventTypes.WebhookDeleted;
  properties: {
    projectId: string;
    webhookId: string;
  };
};

export type TEnvironmentUpdatedEvent = {
  event: PostHogEventTypes.EnvironmentUpdated;
  properties: {
    projectId: string;
    environmentId: string;
  };
};

export type TEnvironmentDeletedEvent = {
  event: PostHogEventTypes.EnvironmentDeleted;
  properties: {
    projectId: string;
    environmentId: string;
  };
};

export type TAppConnectionUpdatedEvent = {
  event: PostHogEventTypes.AppConnectionUpdated;
  properties: {
    appConnectionId: string;
    app: AppConnection;
  };
};

export type TDynamicSecretUpdatedEvent = {
  event: PostHogEventTypes.DynamicSecretUpdated;
  properties: {
    provider: string;
    projectId: string;
    environment: string;
    secretPath: string;
  };
};

export type TDynamicSecretLeaseRevokedEvent = {
  event: PostHogEventTypes.DynamicSecretLeaseRevoked;
  properties: {
    provider: string;
    projectId: string;
    environment: string;
    secretPath: string;
    dynamicSecretId: string;
  };
};

export type TSecretApprovalPolicyUpdatedEvent = {
  event: PostHogEventTypes.SecretApprovalPolicyUpdated;
  properties: {
    policyId: string;
    projectId?: string;
  };
};

export type TAccessApprovalPolicyUpdatedEvent = {
  event: PostHogEventTypes.AccessApprovalPolicyUpdated;
  properties: {
    policyId: string;
    projectId?: string;
  };
};

export type TSecretRotationV2FailedEvent = {
  event: PostHogEventTypes.SecretRotationV2Failed;
  properties: {
    rotationId: string;
    type: SecretRotation;
    projectId: string;
  };
};

export type TPostHogEvent = {
  distinctId: string;
  organizationId?: string;
  organizationName?: string;
  /**
   * When true, the event is captured without creating or updating a PostHog
   * person record (`$process_person_profile: false`). Use for events fired
   * from unauthenticated, single-shot interactions where the distinctId is
   * synthesised per-request (e.g. anonymous public secret shares) and there
   * is no real user/identity to attribute the event to. The event itself is
   * still recorded so funnels and breakdowns continue to work — only the
   * person record is suppressed.
   */
  anonymous?: boolean;
} & (
  | TSecretModifiedEvent
  | TAdminInitEvent
  | TUserSignedUpEvent
  | TUserLoginV2Event
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
  | TSecretRevertPerformedEvent
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
  | TGatewayUpdatedEvent
  | TGatewayDeletedEvent
  | TPamAccountTemplateEvent
  | TPamFolderEvent
  | TPamAccountEvent
  | TPamDiscoveryEvent
  | TPamDiscoveredAccountsImportedEvent
  | TPamAccountAccessedEvent
  | TPamSessionStartedEvent
  | TPamSessionEndedEvent
  | TPamProductMemberEvent
  | TPamFolderMemberEvent
  | TPamAccountMemberEvent
  | TResourceAuthMethodEvent
  | THoneyTokenCreatedEvent
  | THoneyTokenUpdatedEvent
  | THoneyTokenRevokedEvent
  | THoneyTokenResetEvent
  | THoneyTokenTriggeredEvent
  | TCaCreatedEvent
  | TCaDeletedEvent
  | TCaRenewedEvent
  | TCertificatePolicyCreatedEvent
  | TCertificatePolicyDeletedEvent
  | TCertificateProfileCreatedEvent
  | TCertificateProfileDeletedEvent
  | TPkiApplicationCreatedEvent
  | TPkiApplicationDeletedEvent
  | TPkiApplicationMemberAddedEvent
  | TPkiApplicationProfileAttachedEvent
  | TEnrollmentMethodConfiguredEvent
  | TEnrollmentMethodRemovedEvent
  | TCertificateRevokedEvent
  | TCertificateRenewedEvent
  | TCertificateAutoRenewalFailedEvent
  | TCertificateDeletedEvent
  | TCertificateExportedEvent
  | TCertificateRequestCreatedEvent
  | TPkiSyncCreatedEvent
  | TPkiSyncDeletedEvent
  | TPkiSyncExecutedEvent
  | TPkiAlertCreatedEvent
  | TPkiAlertDeletedEvent
  | TPkiApprovalPolicyCreatedEvent
  | TPkiApprovalRequestReviewedEvent
  | TPkiDiscoveryCreatedEvent
  | TPkiDiscoveryScanTriggeredEvent
  | TPkiDiscoveryDeletedEvent
  | TSignerCreatedEvent
  | TSignerDeletedEvent
  | TCodeSigningOperationEvent
  | TCertManagerIdentityAddedEvent
  | TCertificateCleanupConfiguredEvent
  | TCertificateCleanupCompletedEvent
  | TCustomRoleCreatedEvent
  | TCustomRoleUpdatedEvent
  | TCustomRoleDeletedEvent
  | TOrgMembershipRoleUpdatedEvent
  | TOrgMembershipDeletedEvent
  | TProjectMembershipCreatedEvent
  | TProjectMembershipRoleUpdatedEvent
  | TProjectMembershipDeletedEvent
  | TOrganizationCreatedEvent
  | TSubOrganizationCreatedEvent
  | TCmekCreatedEvent
  | TCmekEncryptEvent
  | TCmekDecryptEvent
  | TSecretScanningDataSourceCreatedEvent
  | TSecretScanningScanCompletedEvent
  | TSecretScanningFindingResolvedEvent
  | TGroupCreatedEvent
  | TGroupUpdatedEvent
  | TGroupDeletedEvent
  | TGroupMemberAddedEvent
  | TGroupMemberRemovedEvent
  | TGroupAddedToProjectEvent
  | TSecretTagCreatedEvent
  | TSecretTagUpdatedEvent
  | TSecretTagDeletedEvent
  | TProjectTemplateCreatedEvent
  | TProjectTemplateUpdatedEvent
  | TProjectTemplateDeletedEvent
  | TProjectTemplateAppliedEvent
  | TKmipClientCreatedEvent
  | TKmipClientUpdatedEvent
  | TKmipClientDeletedEvent
  | TKmipOperationEvent
  | TAuditLogStreamCreatedEvent
  | TAuditLogStreamUpdatedEvent
  | TAuditLogStreamDeletedEvent
  | TEmailDomainCreatedEvent
  | TEmailDomainVerifiedEvent
  | TEmailDomainDeletedEvent
  | TExternalMigrationCreatedEvent
  | TGitHubOrgSyncConfiguredEvent
  | TGitHubOrgSyncUpdatedEvent
  | TGitHubOrgSyncDeletedEvent
  | TGitHubOrgSyncExecutedEvent
  | TSecretValidationRuleCreatedEvent
  | TSecretValidationRuleUpdatedEvent
  | TSecretValidationRuleDeletedEvent
  | TSecretSyncFailedEvent
  | TSecretFolderUpdatedEvent
  | TSecretFolderDeletedEvent
  | TSecretImportUpdatedEvent
  | TSecretImportDeletedEvent
  | TWebhookUpdatedEvent
  | TWebhookDeletedEvent
  | TEnvironmentUpdatedEvent
  | TEnvironmentDeletedEvent
  | TAppConnectionUpdatedEvent
  | TDynamicSecretUpdatedEvent
  | TDynamicSecretLeaseRevokedEvent
  | TSecretApprovalPolicyUpdatedEvent
  | TAccessApprovalPolicyUpdatedEvent
  | TSecretRotationV2FailedEvent
);
