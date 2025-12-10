import {
  AcmeAccountActor,
  AcmeProfileActor,
  IdentityActor,
  KmipClientActor,
  PlatformActor,
  ScimClientActor,
  ServiceActor,
  UnknownUserActor,
  UserActor
} from "@app/ee/services/audit-log/audit-log-types";

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
  NotificationUpdated = "Notification Updated"
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
    actor?:
      | UserActor
      | IdentityActor
      | ServiceActor
      | ScimClientActor
      | PlatformActor
      | UnknownUserActor
      | AcmeAccountActor
      | AcmeProfileActor
      | KmipClientActor;
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

export type TPostHogEvent = { distinctId: string; organizationId?: string } & (
  | TSecretModifiedEvent
  | TAdminInitEvent
  | TUserSignedUpEvent
  | TSecretScannerEvent
  | TUserOrgInvitedEvent
  | TMachineIdentityCreatedEvent
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
);
