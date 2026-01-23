import { CaStatus } from "../ca";
import { IdentityTrustedIp } from "../identities/types";
import { PkiItemType } from "../pkiCollections/constants";
import { WorkflowIntegration } from "../workflowIntegrations/types";
import { ActorType, EventType, UserAgentType } from "./enums";

export type TGetAuditLogsFilter = {
  eventType?: EventType[];
  userAgentType?: UserAgentType;
  eventMetadata?: Record<string, string>;
  actorType?: ActorType;
  projectId?: string;
  environment?: string;
  actor?: string; // user ID format
  secretPath?: string;
  secretKey?: string;
  startDate: Date;
  endDate: Date;
  limit: number;
};

interface UserActorMetadata {
  userId: string;
  email: string;
}

interface ServiceActorMetadata {
  serviceId: string;
  name: string;
}

interface IdentityActorMetadata {
  identityId: string;
  name: string;
}
interface KmipClientActorMetadata {
  clientId: string;
  name: string;
}

interface AcmeAccountActorMetadata {
  profileId: string;
  accountId: string;
}
interface AcmeProfileActorMetadata {
  profileId: string;
}
interface EstAccountActorMetadata {
  profileId: string;
}
interface UserActor {
  type: ActorType.USER;
  metadata: UserActorMetadata;
}

export interface ServiceActor {
  type: ActorType.SERVICE;
  metadata: ServiceActorMetadata;
}

export interface IdentityActor {
  type: ActorType.IDENTITY;
  metadata: IdentityActorMetadata;
}

export interface PlatformActor {
  type: ActorType.PLATFORM;
  metadata: object;
}

export interface KmipClientActor {
  type: ActorType.KMIP_CLIENT;
  metadata: KmipClientActorMetadata;
}

export interface UnknownUserActor {
  type: ActorType.UNKNOWN_USER;
}

export interface AcmeProfileActor {
  type: ActorType.ACME_PROFILE;
  metadata: AcmeProfileActorMetadata;
}

export interface AcmeAccountActor {
  type: ActorType.ACME_ACCOUNT;
  metadata: AcmeAccountActorMetadata;
}

export interface EstAccountActor {
  type: ActorType.EST_ACCOUNT;
  metadata: EstAccountActorMetadata;
}

export type Actor =
  | UserActor
  | ServiceActor
  | IdentityActor
  | PlatformActor
  | UnknownUserActor
  | KmipClientActor
  | AcmeProfileActor
  | AcmeAccountActor
  | EstAccountActor;

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

interface GetWorkspaceKeyEvent {
  type: EventType.GET_PROJECT_KEY;
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

interface DeleteIntegrationEvent {
  type: EventType.DELETE_INTEGRATION;
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

interface CreateIdentityEvent {
  // note: currently not logging org-role
  type: EventType.CREATE_IDENTITY;
  metadata: {
    identityId: string;
    name: string;
    hasDeleteProtection: boolean;
  };
}

interface UpdateIdentityEvent {
  type: EventType.UPDATE_IDENTITY;
  metadata: {
    identityId: string;
    name?: string;
    hasDeleteProtection?: boolean;
  };
}

interface DeleteIdentityEvent {
  type: EventType.DELETE_IDENTITY;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityUniversalAuthEvent {
  type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    identityUniversalAuthId: string;
    clientSecretId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityUniversalAuthEvent {
  type: EventType.ADD_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps: Array<IdentityTrustedIp>;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<IdentityTrustedIp>;
  };
}

interface UpdateIdentityUniversalAuthEvent {
  type: EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps?: Array<IdentityTrustedIp>;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<IdentityTrustedIp>;
  };
}

interface GetIdentityUniversalAuthEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
  };
}

interface CreateIdentityUniversalAuthClientSecretEvent {
  type: EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

interface GetIdentityUniversalAuthClientSecretsEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS;
  metadata: {
    identityId: string;
  };
}

interface GetIdentityUniversalAuthClientSecretByIdEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET_BY_ID;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

interface RevokeIdentityUniversalAuthClientSecretEvent {
  type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

interface ClearIdentityUniversalAuthLockoutsEvent {
  type: EventType.CLEAR_IDENTITY_UNIVERSAL_AUTH_LOCKOUTS;
  metadata: {
    identityId: string;
    clientSecretId: string;
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
  type: EventType.ADD_PROJECT_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface RemoveWorkspaceMemberEvent {
  type: EventType.REMOVE_PROJECT_MEMBER;
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
    isDisabled: boolean;
  };
}

interface UpdateWebhookStatusEvent {
  type: EventType.UPDATE_WEBHOOK_STATUS;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
  };
}

interface DeleteWebhookEvent {
  type: EventType.DELETE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
  };
}

export interface WebhookTriggeredEvent {
  type: EventType.WEBHOOK_TRIGGERED;
  metadata: {
    webhookId: string;
    status: string;
    type: string;
    payload: { [k: string]: string | null };
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
  type: EventType.UPDATE_USER_PROJECT_ROLE;
  metadata: {
    userId: string;
    email: string;
    oldRole: string;
    newRole: string;
  };
}

interface UpdateUserDeniedPermissions {
  type: EventType.UPDATE_USER_PROJECT_DENIED_PERMISSIONS;
  metadata: {
    userId: string;
    email: string;
    deniedPermissions: {
      environmentSlug: string;
      ability: string;
    }[];
  };
}

interface CreateCa {
  type: EventType.CREATE_CA;
  metadata: {
    caId: string;
    name: string;
    dn?: string;
  };
}

interface GetCa {
  type: EventType.GET_CA;
  metadata: {
    caId: string;
    dn: string;
    name: string;
  };
}

interface UpdateCa {
  type: EventType.UPDATE_CA;
  metadata: {
    name: string;
    caId: string;
    dn: string;
    status: CaStatus;
  };
}

interface DeleteCa {
  type: EventType.DELETE_CA;
  metadata: {
    caId: string;
    name: string;
    dn: string;
  };
}

interface GetCaCsr {
  type: EventType.GET_CA_CSR;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface GetCaCert {
  type: EventType.GET_CA_CERT;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface SignIntermediate {
  type: EventType.SIGN_INTERMEDIATE;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
  };
}

interface ImportCaCert {
  type: EventType.IMPORT_CA_CERT;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface GetCaCrl {
  type: EventType.GET_CA_CRL;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface IssueCert {
  type: EventType.ISSUE_CERT;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
  };
}
interface ImportCert {
  type: EventType.IMPORT_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface GetCert {
  type: EventType.GET_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface DeleteCert {
  type: EventType.DELETE_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface RevokeCert {
  type: EventType.REVOKE_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface GetCertBody {
  type: EventType.GET_CERT_BODY;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface GetCertPrivateKey {
  type: EventType.GET_CERT_PRIVATE_KEY;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface GetCertBundle {
  type: EventType.GET_CERT_BUNDLE;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
  };
}

interface CreatePkiAlert {
  type: EventType.CREATE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    pkiCollectionId: string;
    name: string;
    alertBeforeDays: number;
    recipientEmails: string;
  };
}
interface GetPkiAlert {
  type: EventType.GET_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
  };
}

interface UpdatePkiAlert {
  type: EventType.UPDATE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    pkiCollectionId?: string;
    name?: string;
    alertBeforeDays?: number;
    recipientEmails?: string;
  };
}
interface DeletePkiAlert {
  type: EventType.DELETE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
  };
}

interface CreatePkiCollection {
  type: EventType.CREATE_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
    name: string;
  };
}

interface GetPkiCollection {
  type: EventType.GET_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
  };
}

interface UpdatePkiCollection {
  type: EventType.UPDATE_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
    name?: string;
  };
}

interface DeletePkiCollection {
  type: EventType.DELETE_PKI_COLLECTION;
  metadata: {
    pkiCollectionId: string;
  };
}

interface GetPkiCollectionItems {
  type: EventType.GET_PKI_COLLECTION_ITEMS;
  metadata: {
    pkiCollectionId: string;
  };
}

interface AddPkiCollectionItem {
  type: EventType.ADD_PKI_COLLECTION_ITEM;
  metadata: {
    pkiCollectionItemId: string;
    pkiCollectionId: string;
    type: PkiItemType;
    itemId: string;
  };
}

interface DeletePkiCollectionItem {
  type: EventType.DELETE_PKI_COLLECTION_ITEM;
  metadata: {
    pkiCollectionItemId: string;
    pkiCollectionId: string;
  };
}

interface OrgAdminAccessProjectEvent {
  type: EventType.ORG_ADMIN_ACCESS_PROJECT;
  metadata: {
    userId: string;
    username: string;
    email: string;
    projectId: string;
  }; // no metadata yet
}

interface OrgAdminBypassSSOEvent {
  type: EventType.ORG_ADMIN_BYPASS_SSO;
  metadata: Record<string, string>; // no metadata yet
}

interface CreateCertificateTemplate {
  type: EventType.CREATE_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
    caId: string;
    pkiCollectionId?: string;
    name: string;
    commonName: string;
    subjectAlternativeName: string;
    ttl: string;
  };
}

interface GetCertificateTemplate {
  type: EventType.GET_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
  };
}

interface UpdateCertificateTemplate {
  type: EventType.UPDATE_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
    caId: string;
    pkiCollectionId?: string;
    name: string;
    commonName: string;
    subjectAlternativeName: string;
    ttl: string;
  };
}

interface DeleteCertificateTemplate {
  type: EventType.DELETE_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
  };
}

interface CreateCertificateTemplateEstConfig {
  type: EventType.CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
    isEnabled: boolean;
  };
}

interface UpdateCertificateTemplateEstConfig {
  type: EventType.UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
    isEnabled: boolean;
  };
}

interface GetCertificateTemplateEstConfig {
  type: EventType.GET_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
  };
}

interface UpdateProjectWorkflowIntegrationConfig {
  type: EventType.UPDATE_PROJECT_WORKFLOW_INTEGRATION_CONFIG;
  metadata: {
    id: string;
    integrationId: string;
    integration: WorkflowIntegration;
    isAccessRequestNotificationEnabled: boolean;
    accessRequestChannels: string;
    isSecretRequestNotificationEnabled: boolean;
    secretRequestChannels: string;
  };
}

interface GetProjectWorkflowIntegrationConfig {
  type: EventType.GET_PROJECT_WORKFLOW_INTEGRATION_CONFIG;
  metadata: {
    id: string;
    integration: WorkflowIntegration;
  };
}

export enum IntegrationSyncedEventTrigger {
  MANUAL = "manual",
  AUTO = "auto"
}

interface IntegrationSyncedEvent {
  type: EventType.INTEGRATION_SYNCED;
  metadata: {
    integrationId: string;
    lastSyncJobId: string;
    lastUsed: Date;
    syncMessage: string;
    isSynced: boolean;
  };
}

interface ClearIdentityLdapAuthLockoutsEvent {
  type: EventType.CLEAR_IDENTITY_LDAP_AUTH_LOCKOUTS;
  metadata: {
    identityId: string;
  };
}

export type Event =
  | GetSecretsEvent
  | GetSecretEvent
  | CreateSecretEvent
  | UpdateSecretEvent
  | DeleteSecretEvent
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
  | CreateIdentityEvent
  | UpdateIdentityEvent
  | DeleteIdentityEvent
  | LoginIdentityUniversalAuthEvent
  | AddIdentityUniversalAuthEvent
  | UpdateIdentityUniversalAuthEvent
  | GetIdentityUniversalAuthEvent
  | CreateIdentityUniversalAuthClientSecretEvent
  | GetIdentityUniversalAuthClientSecretsEvent
  | GetIdentityUniversalAuthClientSecretByIdEvent
  | RevokeIdentityUniversalAuthClientSecretEvent
  | ClearIdentityUniversalAuthLockoutsEvent
  | CreateEnvironmentEvent
  | UpdateEnvironmentEvent
  | DeleteEnvironmentEvent
  | AddWorkspaceMemberEvent
  | RemoveWorkspaceMemberEvent
  | CreateFolderEvent
  | UpdateFolderEvent
  | DeleteFolderEvent
  | CreateWebhookEvent
  | UpdateWebhookStatusEvent
  | DeleteWebhookEvent
  | WebhookTriggeredEvent
  | GetSecretImportsEvent
  | CreateSecretImportEvent
  | UpdateSecretImportEvent
  | DeleteSecretImportEvent
  | UpdateUserRole
  | UpdateUserDeniedPermissions
  | CreateCa
  | GetCa
  | UpdateCa
  | DeleteCa
  | GetCaCsr
  | GetCaCert
  | SignIntermediate
  | ImportCaCert
  | GetCaCrl
  | IssueCert
  | ImportCert
  | GetCert
  | DeleteCert
  | RevokeCert
  | GetCertBody
  | GetCertPrivateKey
  | GetCertBundle
  | CreatePkiAlert
  | GetPkiAlert
  | UpdatePkiAlert
  | DeletePkiAlert
  | CreatePkiCollection
  | GetPkiCollection
  | UpdatePkiCollection
  | DeletePkiCollection
  | GetPkiCollectionItems
  | AddPkiCollectionItem
  | DeletePkiCollectionItem
  | OrgAdminAccessProjectEvent
  | OrgAdminBypassSSOEvent
  | CreateCertificateTemplate
  | UpdateCertificateTemplate
  | GetCertificateTemplate
  | DeleteCertificateTemplate
  | UpdateCertificateTemplateEstConfig
  | CreateCertificateTemplateEstConfig
  | GetCertificateTemplateEstConfig
  | UpdateProjectWorkflowIntegrationConfig
  | GetProjectWorkflowIntegrationConfig
  | IntegrationSyncedEvent
  | ClearIdentityLdapAuthLockoutsEvent;

export type AuditLog = {
  id: string;
  actor: Actor;
  organization: string;
  workspace: string;
  ipAddress: string;
  event: Event;
  userAgent: string;
  userAgentType: UserAgentType;
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  projectId?: string;
};
