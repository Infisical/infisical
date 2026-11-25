import { EventType } from "../event-type";
import type { TAuditLogCollapseSummary } from "./misc";

export interface CreateSubOrganizationEvent {
  type: EventType.CREATE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
    organizationId: string;
  };
}

export interface UpdateSubOrganizationEvent {
  type: EventType.UPDATE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
    organizationId: string;
  };
}

export interface DeleteSubOrganizationEvent {
  type: EventType.DELETE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
    organizationId: string;
  };
}

export interface JoinSubOrganizationEvent {
  type: EventType.JOIN_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
    organizationId: string;
  };
}

export interface UpdateUserOrgMembershipEvent {
  type: EventType.UPDATE_USER_ORG_MEMBERSHIP;
  metadata: {
    membershipId: string;
    userId: string;
    role?: string;
    isActive?: boolean;
    metadataKeys?: string[];
  };
}

export interface DeleteUserOrgMembershipEvent {
  type: EventType.DELETE_USER_ORG_MEMBERSHIP;
  metadata: {
    membershipId: string;
    userId: string;
  };
}

export interface InviteOrgMembersEvent {
  type: EventType.INVITE_ORG_MEMBERS;
  metadata: {
    inviteeEmails: string[];
    organizationRoleSlug: string;
    projects?: { id: string; name: string }[];
  };
}

export interface CreateGroupEvent {
  type: EventType.CREATE_GROUP;
  metadata: {
    groupId: string;
    name: string;
    slug: string;
    role: string;
  };
}

export interface UpdateGroupEvent {
  type: EventType.UPDATE_GROUP;
  metadata: {
    groupId: string;
    name?: string;
    slug?: string;
    role?: string;
  };
}

export interface DeleteGroupEvent {
  type: EventType.DELETE_GROUP;
  metadata: {
    groupId: string;
    name: string;
    slug: string;
  };
}

export interface LinkGroupToSubOrgEvent {
  type: EventType.LINK_GROUP_TO_SUB_ORG;
  metadata: {
    groupId: string;
    groupName: string;
    roles: Array<{
      role: string;
      isTemporary: boolean;
      temporaryMode?: string;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }>;
  };
}

export interface UpdateGroupOrgMembershipEvent {
  type: EventType.UPDATE_GROUP_ORG_MEMBERSHIP;
  metadata: {
    groupId: string;
    groupName: string;
    roles: Array<{
      role: string;
      isTemporary: boolean;
      temporaryMode?: string;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }>;
  };
}

export interface UnlinkGroupFromSubOrgEvent {
  type: EventType.UNLINK_GROUP_FROM_SUB_ORG;
  metadata: {
    groupId: string;
    groupName: string;
  };
}

export interface AddUserToGroupEvent {
  type: EventType.ADD_USER_TO_GROUP;
  metadata: {
    groupId: string;
    groupName: string;
    userId: string;
    username: string;
    source?: "github-org-sync";
    githubOrgName?: string;
    syncTrigger?: "login" | "manual";
  };
}

export interface RemoveUserFromGroupEvent {
  type: EventType.REMOVE_USER_FROM_GROUP;
  metadata: {
    groupId: string;
    groupName: string;
    userId: string;
    username: string;
    source?: "github-org-sync";
    githubOrgName?: string;
    syncTrigger?: "login" | "manual";
  };
}

export interface OrgAdminBypassSSOEvent {
  type: EventType.ORG_ADMIN_BYPASS_SSO;
  metadata: Record<string, string>; // no metadata yet
}

export type TMfaSatisfiedBy = "not-required" | "infisical" | "idp";

export interface UserLoginEvent {
  type: EventType.USER_LOGIN;
  metadata: {
    organizationId?: string;
    authProvider?: string;
    idpMfa?: TAuditLogIdpMfaSignal;
  };
}

export interface SelectOrganizationEvent {
  type: EventType.SELECT_ORGANIZATION;
  metadata: {
    organizationId: string;
    organizationName: string;
    mfaSatisfiedBy?: TMfaSatisfiedBy;
  };
}

// The session was issued by another root org's IdP, which does not satisfy this org's enforcement.
export interface SelectOrganizationRefusedEvent {
  type: EventType.SELECT_ORGANIZATION_REFUSED;
  metadata: {
    organizationId: string;
    organizationName: string;
  };
}

export interface SelectSubOrganizationEvent {
  type: EventType.SELECT_SUB_ORGANIZATION;
  metadata: {
    organizationId: string;
    organizationName: string;
    rootOrganizationId: string;
    mfaSatisfiedBy?: TMfaSatisfiedBy;
  };
}

export interface GetExternalGroupOrgRoleMappingsEvent {
  type: EventType.GET_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS;
  metadata?: Record<string, never>; // not needed, based off orgId
}

export interface UpdateExternalGroupOrgRoleMappingsEvent {
  type: EventType.UPDATE_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS;
  metadata: {
    mappings: { groupName: string; roleSlug: string }[];
  };
}

export interface OidcGroupMembershipMappingAssignUserEvent {
  type: EventType.OIDC_GROUP_MEMBERSHIP_MAPPING_ASSIGN_USER;
  metadata: {
    assignedToGroups: { id: string; name: string }[];
    userId: string;
    userEmail: string;
    userGroupsClaim: string[];
  };
}

export interface OidcGroupMembershipMappingRemoveUserEvent {
  type: EventType.OIDC_GROUP_MEMBERSHIP_MAPPING_REMOVE_USER;
  metadata: {
    removedFromGroups: { id: string; name: string }[];
    userId: string;
    userEmail: string;
    userGroupsClaim: string[];
  };
}

export interface OidcProvisionedPlaceholderAdoptedEvent {
  type: EventType.OIDC_PROVISIONED_PLACEHOLDER_ADOPTED;
  metadata: {
    userId: string;
    externalId: string;
    previousUsername: string;
    newUsername: string;
  };
}

export interface SsoUserProfileSyncedEvent {
  type: EventType.SSO_USER_PROFILE_SYNCED;
  metadata: {
    userId: string;
    aliasType: string;
    externalId: string;
    previousEmail?: string;
    newEmail?: string;
    previousFirstName?: string | null;
    newFirstName?: string;
    previousLastName?: string | null;
    newLastName?: string;
  };
}

export type TSsoUserEmailSyncSkipReason = "address-taken" | "domain-not-owned";

export interface SsoUserEmailSyncSkippedEvent {
  type: EventType.SSO_USER_EMAIL_SYNC_SKIPPED;
  metadata: {
    userId: string;
    aliasType: string;
    externalId: string;
    currentEmail: string;
    assertedEmail: string;
    reason: TSsoUserEmailSyncSkipReason;
    conflictingUserId?: string;
  };
}

export interface MicrosoftTeamsWorkflowIntegrationCreateEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CREATE;
  metadata: {
    tenantId: string;
    slug: string;
    description?: string;
  };
}

export interface MicrosoftTeamsWorkflowIntegrationDeleteEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_DELETE;
  metadata: {
    tenantId: string;
    id: string;
    slug: string;
  };
}

export interface MicrosoftTeamsWorkflowIntegrationCheckInstallationStatusEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CHECK_INSTALLATION_STATUS;
  metadata: {
    tenantId: string;
    slug: string;
  };
}

export interface MicrosoftTeamsWorkflowIntegrationGetTeamsEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET_TEAMS;
  metadata: {
    tenantId: string;
    slug: string;
    id: string;
  };
}

export interface MicrosoftTeamsWorkflowIntegrationGetEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET;
  metadata: {
    tenantId: string;
    slug: string;
    id: string;
  };
}

export interface MicrosoftTeamsWorkflowIntegrationListEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_LIST;
  metadata: Record<string, string>;
}

export interface MicrosoftTeamsWorkflowIntegrationUpdateEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_UPDATE;
  metadata: {
    tenantId: string;
    slug: string;
    id: string;
    newSlug?: string;
    newDescription?: string;
  };
}

export interface OrgAiConfigUpdateEvent {
  type: EventType.UPDATE_ORG_AI_CONFIG;
  metadata: {
    connectionId: string | null;
    connectionName: string | null;
    model: string | null;
  };
}

export interface OrgSsoSettingsUpdateEvent {
  type: EventType.UPDATE_ORG_SSO_SETTINGS;
  metadata: {
    authEnforced?: boolean;
    googleSsoAuthEnforced?: boolean;
    bypassOrgAuthEnabled?: boolean;
    ssoMfaTrust?: string;
  };
}

// The OIDC config columns an audit log records (OIDC_CONFIG_AUDIT_FIELDS), never its secrets.
export type TAuditLogOidcConfigFields = {
  configurationType: string;
  discoveryURL?: string | null;
  issuer?: string | null;
  authorizationEndpoint?: string | null;
  jwksUri?: string | null;
  tokenEndpoint?: string | null;
  userinfoEndpoint?: string | null;
  allowedEmailDomains?: string | null;
  isActive: boolean;
  manageGroupMemberships: boolean;
  jwtSignatureAlgorithm: string;
  mfaClaimName: string;
  mfaAmrValues?: string[] | null;
};

export interface CreateOidcConfigEvent {
  type: EventType.CREATE_OIDC_CONFIG;
  metadata: {
    oidcConfigId: string;
    organizationName: string;
  } & TAuditLogOidcConfigFields;
}

export interface UpdateOidcConfigEvent {
  type: EventType.UPDATE_OIDC_CONFIG;
  metadata: {
    oidcConfigId: string;
    organizationName: string;
    clientCredentialsUpdated: boolean;
    ssoEnforcementDisabled: boolean;
  } & Partial<TAuditLogOidcConfigFields>;
}

export interface DeleteOidcConfigEvent {
  type: EventType.DELETE_OIDC_CONFIG;
  metadata: {
    oidcConfigId: string;
    organizationName: string;
  };
}

export interface OrgUpdateEvent {
  type: EventType.UPDATE_ORG;
  metadata: {
    name?: string;
    slug?: string;
    authEnforced?: boolean;
    scimEnabled?: boolean;
    defaultMembershipRoleSlug?: string;
    enforceMfa?: boolean;
    allowedMfaMethods?: string[];
    allowSecretSharingOutsideOrganization?: boolean;
    bypassOrgAuthEnabled?: boolean;
    userTokenExpiration?: string;
    secretsProductEnabled?: boolean;
    pkiProductEnabled?: boolean;
    kmsProductEnabled?: boolean;
    scannerProductEnabled?: boolean;
    shareSecretsProductEnabled?: boolean;
  };
}

export interface CreateAuditReportEvent {
  type: EventType.CREATE_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    projectId: string;
    reportTypes: string[];
    recipientCount: number;
  };
}

export interface GetAuditReportsEvent {
  type: EventType.GET_AUDIT_REPORTS;
  metadata: {
    projectId: string;
  };
}

export interface GetAuditReportEvent {
  type: EventType.GET_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    projectId: string;
  };
}

export interface DeleteAuditReportEvent {
  type: EventType.DELETE_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    projectId: string;
  };
}

// Org-scoped report events carry no org id in metadata: the audit log row itself is org-scoped.
export interface CreateOrgAuditReportEvent {
  type: EventType.CREATE_ORG_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    reportTypes: string[];
    recipientCount: number;
  };
}

export interface GetOrgAuditReportsEvent {
  type: EventType.GET_ORG_AUDIT_REPORTS;
  metadata: {
    offset: number;
    limit: number;
  };
}

export interface DeleteOrgAuditReportEvent {
  type: EventType.DELETE_ORG_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
  };
}

export interface ViewAuditLogsEvent {
  type: EventType.VIEW_AUDIT_LOGS;
  metadata?: Record<string, unknown>;
}

export interface PermissionDeniedEvent {
  type: EventType.PERMISSION_DENIED;
  metadata: TAuditLogCollapseSummary & {
    permissionAction?: string;
    permissionSubject?: string;
    permissionSubjectDetails?: Record<string, unknown>;
    errorName: string;
    route?: string;
    method: string;
  };
}

export interface UpdateAuditLogSettingsEvent {
  type: EventType.UPDATE_AUDIT_LOG_SETTINGS;
  metadata: {
    scope: "organization" | "project";
    eventClasses?: { eventClass: string; isEnabled: boolean }[];
    auditLogsRetentionDays?: number;
  };
}

export interface OrgRoleCreateEvent {
  type: EventType.CREATE_ORG_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
    description?: string | null;
    permissions: string;
  };
}

export interface OrgRoleUpdateEvent {
  type: EventType.UPDATE_ORG_ROLE;
  metadata: {
    roleId: string;
    slug?: string;
    name?: string;
    description?: string | null;
    permissions?: string;
  };
}

export interface OrgRoleDeleteEvent {
  type: EventType.DELETE_ORG_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
  };
}

export interface CreateOauthClientEvent {
  type: EventType.CREATE_OAUTH_CLIENT;
  metadata: {
    clientDbId: string;
    clientId: string;
    name: string;
    grantTypes: string[];
    accessTokenTTL: number;
    tokenExchangeAudience?: string | null;
    tokenExchangeIdpSatisfiesMfa: boolean;
  };
}

export interface UpdateOauthClientEvent {
  type: EventType.UPDATE_OAUTH_CLIENT;
  metadata: {
    clientDbId: string;
    clientId: string;
    name: string;
    grantTypes: string[];
    accessTokenTTL: number;
    tokenExchangeAudience?: string | null;
    tokenExchangeIdpSatisfiesMfa: boolean;
  };
}

export interface DeleteOauthClientEvent {
  type: EventType.DELETE_OAUTH_CLIENT;
  metadata: {
    clientDbId: string;
    clientId: string;
    name: string;
  };
}

export interface RotateOauthClientSecretEvent {
  type: EventType.ROTATE_OAUTH_CLIENT_SECRET;
  metadata: {
    clientDbId: string;
    clientId: string;
    name: string;
  };
}

export interface OauthClientAuthorizeEvent {
  type: EventType.OAUTH_CLIENT_AUTHORIZE;
  metadata: {
    clientId: string;
    clientName: string;
    scopes: string[];
    resource?: string;
  };
}

export interface OauthClientTokenExchangeEvent {
  type: EventType.OAUTH_CLIENT_TOKEN_EXCHANGE;
  metadata: {
    clientDbId: string;
    clientId: string;
    clientName: string;
    subjectUserId: string;
    subjectExternalId: string;
    tokenVersionId: string;
  };
}

export interface IssueOidcTokenEvent {
  type: EventType.ISSUE_OIDC_TOKEN;
  metadata: {
    connectionId: string;
    connectionName: string;
    audience: string;
  };
}

export interface CreateEmailDomainEvent {
  type: EventType.CREATE_EMAIL_DOMAIN;
  metadata: {
    emailDomainId: string;
    domain: string;
  };
}

export interface VerifyEmailDomainEvent {
  type: EventType.VERIFY_EMAIL_DOMAIN;
  metadata: {
    emailDomainId: string;
    domain: string;
  };
}

export interface DeleteEmailDomainEvent {
  type: EventType.DELETE_EMAIL_DOMAIN;
  metadata: {
    emailDomainId: string;
    domain: string;
  };
}

export type TAuditLogIdpMfaSignal = {
  verified: boolean;
  evidence: string[];
  received: string[];
};

export type TOrganizationAuditLogEvent =
  | CreateSubOrganizationEvent
  | UpdateSubOrganizationEvent
  | DeleteSubOrganizationEvent
  | JoinSubOrganizationEvent
  | UpdateUserOrgMembershipEvent
  | DeleteUserOrgMembershipEvent
  | InviteOrgMembersEvent
  | CreateGroupEvent
  | UpdateGroupEvent
  | DeleteGroupEvent
  | LinkGroupToSubOrgEvent
  | UpdateGroupOrgMembershipEvent
  | UnlinkGroupFromSubOrgEvent
  | AddUserToGroupEvent
  | RemoveUserFromGroupEvent
  | OrgAdminBypassSSOEvent
  | UserLoginEvent
  | SelectOrganizationEvent
  | SelectOrganizationRefusedEvent
  | SelectSubOrganizationEvent
  | GetExternalGroupOrgRoleMappingsEvent
  | UpdateExternalGroupOrgRoleMappingsEvent
  | OidcGroupMembershipMappingAssignUserEvent
  | OidcGroupMembershipMappingRemoveUserEvent
  | OidcProvisionedPlaceholderAdoptedEvent
  | SsoUserProfileSyncedEvent
  | SsoUserEmailSyncSkippedEvent
  | MicrosoftTeamsWorkflowIntegrationCreateEvent
  | MicrosoftTeamsWorkflowIntegrationDeleteEvent
  | MicrosoftTeamsWorkflowIntegrationCheckInstallationStatusEvent
  | MicrosoftTeamsWorkflowIntegrationGetTeamsEvent
  | MicrosoftTeamsWorkflowIntegrationGetEvent
  | MicrosoftTeamsWorkflowIntegrationListEvent
  | MicrosoftTeamsWorkflowIntegrationUpdateEvent
  | OrgAiConfigUpdateEvent
  | OrgUpdateEvent
  | CreateAuditReportEvent
  | GetAuditReportsEvent
  | GetAuditReportEvent
  | DeleteAuditReportEvent
  | CreateOrgAuditReportEvent
  | GetOrgAuditReportsEvent
  | DeleteOrgAuditReportEvent
  | ViewAuditLogsEvent
  | PermissionDeniedEvent
  | UpdateAuditLogSettingsEvent
  | OrgRoleCreateEvent
  | OrgRoleUpdateEvent
  | OrgRoleDeleteEvent
  | CreateOauthClientEvent
  | UpdateOauthClientEvent
  | DeleteOauthClientEvent
  | RotateOauthClientSecretEvent
  | OauthClientAuthorizeEvent
  | OauthClientTokenExchangeEvent
  | IssueOidcTokenEvent
  | CreateEmailDomainEvent
  | VerifyEmailDomainEvent
  | DeleteEmailDomainEvent
  | OrgSsoSettingsUpdateEvent
  | CreateOidcConfigEvent
  | UpdateOidcConfigEvent
  | DeleteOidcConfigEvent;
