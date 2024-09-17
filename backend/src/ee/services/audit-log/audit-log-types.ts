import { TProjectPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-types";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { PkiItemType } from "@app/services/pki-collection/pki-collection-types";

export type TListProjectAuditLogDTO = {
  filter: {
    userAgentType?: UserAgentType;
    eventType?: EventType[];
    offset?: number;
    limit: number;
    endDate?: string;
    startDate?: string;
    projectId?: string;
    auditLogActorId?: string;
    actorType?: ActorType;
    eventMetadata?: Record<string, string>;
  };
} & Omit<TProjectPermission, "projectId">;

export type TCreateAuditLogDTO = {
  event: Event;
  actor: UserActor | IdentityActor | ServiceActor | ScimClientActor | PlatformActor;
  orgId?: string;
  projectId?: string;
} & BaseAuthData;

interface BaseAuthData {
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
}

export enum UserAgentType {
  WEB = "web",
  CLI = "cli",
  K8_OPERATOR = "k8-operator",
  TERRAFORM = "terraform",
  OTHER = "other",
  PYTHON_SDK = "InfisicalPythonSDK",
  NODE_SDK = "InfisicalNodeSDK"
}

export enum EventType {
  GET_SECRETS = "get-secrets",
  GET_SECRET = "get-secret",
  REVEAL_SECRET = "reveal-secret",
  CREATE_SECRET = "create-secret",
  CREATE_SECRETS = "create-secrets",
  UPDATE_SECRET = "update-secret",
  UPDATE_SECRETS = "update-secrets",
  MOVE_SECRETS = "move-secrets",
  DELETE_SECRET = "delete-secret",
  DELETE_SECRETS = "delete-secrets",
  GET_WORKSPACE_KEY = "get-workspace-key",
  AUTHORIZE_INTEGRATION = "authorize-integration",
  UNAUTHORIZE_INTEGRATION = "unauthorize-integration",
  CREATE_INTEGRATION = "create-integration",
  DELETE_INTEGRATION = "delete-integration",
  MANUAL_SYNC_INTEGRATION = "manual-sync-integration",
  ADD_TRUSTED_IP = "add-trusted-ip",
  UPDATE_TRUSTED_IP = "update-trusted-ip",
  DELETE_TRUSTED_IP = "delete-trusted-ip",
  CREATE_SERVICE_TOKEN = "create-service-token", // v2
  DELETE_SERVICE_TOKEN = "delete-service-token", // v2
  CREATE_IDENTITY = "create-identity",
  UPDATE_IDENTITY = "update-identity",
  DELETE_IDENTITY = "delete-identity",
  LOGIN_IDENTITY_UNIVERSAL_AUTH = "login-identity-universal-auth",
  ADD_IDENTITY_UNIVERSAL_AUTH = "add-identity-universal-auth",
  UPDATE_IDENTITY_UNIVERSAL_AUTH = "update-identity-universal-auth",
  GET_IDENTITY_UNIVERSAL_AUTH = "get-identity-universal-auth",
  REVOKE_IDENTITY_UNIVERSAL_AUTH = "revoke-identity-universal-auth",
  CREATE_TOKEN_IDENTITY_TOKEN_AUTH = "create-token-identity-token-auth",
  UPDATE_TOKEN_IDENTITY_TOKEN_AUTH = "update-token-identity-token-auth",
  GET_TOKENS_IDENTITY_TOKEN_AUTH = "get-tokens-identity-token-auth",
  ADD_IDENTITY_TOKEN_AUTH = "add-identity-token-auth",
  UPDATE_IDENTITY_TOKEN_AUTH = "update-identity-token-auth",
  GET_IDENTITY_TOKEN_AUTH = "get-identity-token-auth",
  REVOKE_IDENTITY_TOKEN_AUTH = "revoke-identity-token-auth",
  LOGIN_IDENTITY_KUBERNETES_AUTH = "login-identity-kubernetes-auth",
  ADD_IDENTITY_KUBERNETES_AUTH = "add-identity-kubernetes-auth",
  UPDATE_IDENTITY_KUBENETES_AUTH = "update-identity-kubernetes-auth",
  GET_IDENTITY_KUBERNETES_AUTH = "get-identity-kubernetes-auth",
  REVOKE_IDENTITY_KUBERNETES_AUTH = "revoke-identity-kubernetes-auth",
  LOGIN_IDENTITY_OIDC_AUTH = "login-identity-oidc-auth",
  ADD_IDENTITY_OIDC_AUTH = "add-identity-oidc-auth",
  UPDATE_IDENTITY_OIDC_AUTH = "update-identity-oidc-auth",
  GET_IDENTITY_OIDC_AUTH = "get-identity-oidc-auth",
  REVOKE_IDENTITY_OIDC_AUTH = "revoke-identity-oidc-auth",
  CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET = "create-identity-universal-auth-client-secret",
  REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET = "revoke-identity-universal-auth-client-secret",
  GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS = "get-identity-universal-auth-client-secret",
  GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET_BY_ID = "get-identity-universal-auth-client-secret-by-id",
  LOGIN_IDENTITY_GCP_AUTH = "login-identity-gcp-auth",
  ADD_IDENTITY_GCP_AUTH = "add-identity-gcp-auth",
  UPDATE_IDENTITY_GCP_AUTH = "update-identity-gcp-auth",
  REVOKE_IDENTITY_GCP_AUTH = "revoke-identity-gcp-auth",
  GET_IDENTITY_GCP_AUTH = "get-identity-gcp-auth",
  LOGIN_IDENTITY_AWS_AUTH = "login-identity-aws-auth",
  ADD_IDENTITY_AWS_AUTH = "add-identity-aws-auth",
  UPDATE_IDENTITY_AWS_AUTH = "update-identity-aws-auth",
  REVOKE_IDENTITY_AWS_AUTH = "revoke-identity-aws-auth",
  GET_IDENTITY_AWS_AUTH = "get-identity-aws-auth",
  LOGIN_IDENTITY_AZURE_AUTH = "login-identity-azure-auth",
  ADD_IDENTITY_AZURE_AUTH = "add-identity-azure-auth",
  UPDATE_IDENTITY_AZURE_AUTH = "update-identity-azure-auth",
  GET_IDENTITY_AZURE_AUTH = "get-identity-azure-auth",
  REVOKE_IDENTITY_AZURE_AUTH = "revoke-identity-azure-auth",
  CREATE_ENVIRONMENT = "create-environment",
  UPDATE_ENVIRONMENT = "update-environment",
  DELETE_ENVIRONMENT = "delete-environment",
  GET_ENVIRONMENT = "get-environment",
  ADD_WORKSPACE_MEMBER = "add-workspace-member",
  ADD_BATCH_WORKSPACE_MEMBER = "add-workspace-members",
  REMOVE_WORKSPACE_MEMBER = "remove-workspace-member",
  CREATE_FOLDER = "create-folder",
  UPDATE_FOLDER = "update-folder",
  DELETE_FOLDER = "delete-folder",
  CREATE_WEBHOOK = "create-webhook",
  UPDATE_WEBHOOK_STATUS = "update-webhook-status",
  DELETE_WEBHOOK = "delete-webhook",
  GET_SECRET_IMPORTS = "get-secret-imports",
  CREATE_SECRET_IMPORT = "create-secret-import",
  UPDATE_SECRET_IMPORT = "update-secret-import",
  DELETE_SECRET_IMPORT = "delete-secret-import",
  UPDATE_USER_WORKSPACE_ROLE = "update-user-workspace-role",
  UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS = "update-user-workspace-denied-permissions",
  SECRET_APPROVAL_MERGED = "secret-approval-merged",
  SECRET_APPROVAL_REQUEST = "secret-approval-request",
  SECRET_APPROVAL_CLOSED = "secret-approval-closed",
  SECRET_APPROVAL_REOPENED = "secret-approval-reopened",
  CREATE_CA = "create-certificate-authority",
  GET_CA = "get-certificate-authority",
  UPDATE_CA = "update-certificate-authority",
  DELETE_CA = "delete-certificate-authority",
  RENEW_CA = "renew-certificate-authority",
  GET_CA_CSR = "get-certificate-authority-csr",
  GET_CA_CERTS = "get-certificate-authority-certs",
  GET_CA_CERT = "get-certificate-authority-cert",
  SIGN_INTERMEDIATE = "sign-intermediate",
  IMPORT_CA_CERT = "import-certificate-authority-cert",
  GET_CA_CRLS = "get-certificate-authority-crls",
  ISSUE_CERT = "issue-cert",
  SIGN_CERT = "sign-cert",
  GET_CA_CERTIFICATE_TEMPLATES = "get-ca-certificate-templates",
  GET_CERT = "get-cert",
  DELETE_CERT = "delete-cert",
  REVOKE_CERT = "revoke-cert",
  GET_CERT_BODY = "get-cert-body",
  CREATE_PKI_ALERT = "create-pki-alert",
  GET_PKI_ALERT = "get-pki-alert",
  UPDATE_PKI_ALERT = "update-pki-alert",
  DELETE_PKI_ALERT = "delete-pki-alert",
  CREATE_PKI_COLLECTION = "create-pki-collection",
  GET_PKI_COLLECTION = "get-pki-collection",
  UPDATE_PKI_COLLECTION = "update-pki-collection",
  DELETE_PKI_COLLECTION = "delete-pki-collection",
  GET_PKI_COLLECTION_ITEMS = "get-pki-collection-items",
  ADD_PKI_COLLECTION_ITEM = "add-pki-collection-item",
  DELETE_PKI_COLLECTION_ITEM = "delete-pki-collection-item",
  CREATE_KMS = "create-kms",
  UPDATE_KMS = "update-kms",
  DELETE_KMS = "delete-kms",
  GET_KMS = "get-kms",
  UPDATE_PROJECT_KMS = "update-project-kms",
  GET_PROJECT_KMS_BACKUP = "get-project-kms-backup",
  LOAD_PROJECT_KMS_BACKUP = "load-project-kms-backup",
  ORG_ADMIN_ACCESS_PROJECT = "org-admin-accessed-project",
  CREATE_CERTIFICATE_TEMPLATE = "create-certificate-template",
  UPDATE_CERTIFICATE_TEMPLATE = "update-certificate-template",
  DELETE_CERTIFICATE_TEMPLATE = "delete-certificate-template",
  GET_CERTIFICATE_TEMPLATE = "get-certificate-template",
  CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG = "create-certificate-template-est-config",
  UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG = "update-certificate-template-est-config",
  GET_CERTIFICATE_TEMPLATE_EST_CONFIG = "get-certificate-template-est-config",
  ATTEMPT_CREATE_SLACK_INTEGRATION = "attempt-create-slack-integration",
  ATTEMPT_REINSTALL_SLACK_INTEGRATION = "attempt-reinstall-slack-integration",
  GET_SLACK_INTEGRATION = "get-slack-integration",
  UPDATE_SLACK_INTEGRATION = "update-slack-integration",
  DELETE_SLACK_INTEGRATION = "delete-slack-integration",
  GET_PROJECT_SLACK_CONFIG = "get-project-slack-config",
  UPDATE_PROJECT_SLACK_CONFIG = "update-project-slack-config",
  INTEGRATION_SYNCED = "integration-synced"
}

interface UserActorMetadata {
  userId: string;
  email?: string | null;
  username: string;
}

interface ServiceActorMetadata {
  serviceId: string;
  name: string;
}

interface IdentityActorMetadata {
  identityId: string;
  name: string;
}

interface ScimClientActorMetadata {}

interface PlatformActorMetadata {}

export interface UserActor {
  type: ActorType.USER;
  metadata: UserActorMetadata;
}

export interface ServiceActor {
  type: ActorType.SERVICE;
  metadata: ServiceActorMetadata;
}

export interface PlatformActor {
  type: ActorType.PLATFORM;
  metadata: PlatformActorMetadata;
}

export interface IdentityActor {
  type: ActorType.IDENTITY;
  metadata: IdentityActorMetadata;
}

export interface ScimClientActor {
  type: ActorType.SCIM_CLIENT;
  metadata: ScimClientActorMetadata;
}

export type Actor = UserActor | ServiceActor | IdentityActor | ScimClientActor | PlatformActor;

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

interface MoveSecretsEvent {
  type: EventType.MOVE_SECRETS;
  metadata: {
    sourceEnvironment: string;
    sourceSecretPath: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
    secretIds: string[];
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
    shouldDeleteIntegrationSecrets?: boolean;
  };
}

interface ManualSyncIntegrationEvent {
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
  };
}

interface UpdateIdentityEvent {
  type: EventType.UPDATE_IDENTITY;
  metadata: {
    identityId: string;
    name?: string;
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
    clientSecretTrustedIps: Array<TIdentityTrustedIp>;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface UpdateIdentityUniversalAuthEvent {
  type: EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps?: Array<TIdentityTrustedIp>;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityUniversalAuthEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
  };
}

interface DeleteIdentityUniversalAuthEvent {
  type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
  };
}

interface CreateTokenIdentityTokenAuthEvent {
  type: EventType.CREATE_TOKEN_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    identityAccessTokenId: string;
  };
}

interface UpdateTokenIdentityTokenAuthEvent {
  type: EventType.UPDATE_TOKEN_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    tokenId: string;
    name?: string;
  };
}

interface GetTokensIdentityTokenAuthEvent {
  type: EventType.GET_TOKENS_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
  };
}

interface AddIdentityTokenAuthEvent {
  type: EventType.ADD_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface UpdateIdentityTokenAuthEvent {
  type: EventType.UPDATE_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityTokenAuthEvent {
  type: EventType.GET_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
  };
}

interface DeleteIdentityTokenAuthEvent {
  type: EventType.REVOKE_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityKubernetesAuthEvent {
  type: EventType.LOGIN_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
    identityKubernetesAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityKubernetesAuthEvent {
  type: EventType.ADD_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
    kubernetesHost: string;
    allowedNamespaces: string;
    allowedNames: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityKubernetesAuthEvent {
  type: EventType.REVOKE_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityKubernetesAuthEvent {
  type: EventType.UPDATE_IDENTITY_KUBENETES_AUTH;
  metadata: {
    identityId: string;
    kubernetesHost?: string;
    allowedNamespaces?: string;
    allowedNames?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityKubernetesAuthEvent {
  type: EventType.GET_IDENTITY_KUBERNETES_AUTH;
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

interface LoginIdentityGcpAuthEvent {
  type: EventType.LOGIN_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
    identityGcpAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityGcpAuthEvent {
  type: EventType.ADD_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
    type: string;
    allowedServiceAccounts: string;
    allowedProjects: string;
    allowedZones: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityGcpAuthEvent {
  type: EventType.REVOKE_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityGcpAuthEvent {
  type: EventType.UPDATE_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
    type?: string;
    allowedServiceAccounts?: string;
    allowedProjects?: string;
    allowedZones?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityGcpAuthEvent {
  type: EventType.GET_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityAwsAuthEvent {
  type: EventType.LOGIN_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
    identityAwsAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityAwsAuthEvent {
  type: EventType.ADD_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
    stsEndpoint: string;
    allowedPrincipalArns: string;
    allowedAccountIds: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityAwsAuthEvent {
  type: EventType.REVOKE_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityAwsAuthEvent {
  type: EventType.UPDATE_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
    stsEndpoint?: string;
    allowedPrincipalArns?: string;
    allowedAccountIds?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityAwsAuthEvent {
  type: EventType.GET_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityAzureAuthEvent {
  type: EventType.LOGIN_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
    identityAzureAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityAzureAuthEvent {
  type: EventType.ADD_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
    tenantId: string;
    resource: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityAzureAuthEvent {
  type: EventType.REVOKE_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityAzureAuthEvent {
  type: EventType.UPDATE_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
    tenantId?: string;
    resource?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityAzureAuthEvent {
  type: EventType.GET_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityOidcAuthEvent {
  type: EventType.LOGIN_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    identityOidcAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityOidcAuthEvent {
  type: EventType.ADD_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    oidcDiscoveryUrl: string;
    caCert: string;
    boundIssuer: string;
    boundAudiences: string;
    boundClaims: Record<string, string>;
    boundSubject: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityOidcAuthEvent {
  type: EventType.REVOKE_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityOidcAuthEvent {
  type: EventType.UPDATE_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    oidcDiscoveryUrl?: string;
    caCert?: string;
    boundIssuer?: string;
    boundAudiences?: string;
    boundClaims?: Record<string, string>;
    boundSubject?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityOidcAuthEvent {
  type: EventType.GET_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
  };
}

interface CreateEnvironmentEvent {
  type: EventType.CREATE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

interface GetEnvironmentEvent {
  type: EventType.GET_ENVIRONMENT;
  metadata: {
    id: string;
  };
}

interface UpdateEnvironmentEvent {
  type: EventType.UPDATE_ENVIRONMENT;
  metadata: {
    oldName: string;
    newName: string;
    oldSlug: string;
    newSlug: string;
    oldPos: number;
    newPos: number;
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

interface GetSecretImportsEvent {
  type: EventType.GET_SECRET_IMPORTS;
  metadata: {
    environment: string;
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

interface CreateCa {
  type: EventType.CREATE_CA;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface GetCa {
  type: EventType.GET_CA;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface UpdateCa {
  type: EventType.UPDATE_CA;
  metadata: {
    caId: string;
    dn: string;
    status: CaStatus;
  };
}

interface DeleteCa {
  type: EventType.DELETE_CA;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface RenewCa {
  type: EventType.RENEW_CA;
  metadata: {
    caId: string;
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

interface GetCaCerts {
  type: EventType.GET_CA_CERTS;
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

interface GetCaCrls {
  type: EventType.GET_CA_CRLS;
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

interface SignCert {
  type: EventType.SIGN_CERT;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
  };
}

interface GetCaCertificateTemplates {
  type: EventType.GET_CA_CERTIFICATE_TEMPLATES;
  metadata: {
    caId: string;
    dn: string;
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

interface CreateKmsEvent {
  type: EventType.CREATE_KMS;
  metadata: {
    kmsId: string;
    provider: string;
    slug: string;
    description?: string;
  };
}

interface DeleteKmsEvent {
  type: EventType.DELETE_KMS;
  metadata: {
    kmsId: string;
    slug: string;
  };
}

interface UpdateKmsEvent {
  type: EventType.UPDATE_KMS;
  metadata: {
    kmsId: string;
    provider: string;
    slug?: string;
    description?: string;
  };
}

interface GetKmsEvent {
  type: EventType.GET_KMS;
  metadata: {
    kmsId: string;
    slug: string;
  };
}

interface UpdateProjectKmsEvent {
  type: EventType.UPDATE_PROJECT_KMS;
  metadata: {
    secretManagerKmsKey: {
      id: string;
      slug: string;
    };
  };
}

interface GetProjectKmsBackupEvent {
  type: EventType.GET_PROJECT_KMS_BACKUP;
  metadata: Record<string, string>; // no metadata yet
}

interface LoadProjectKmsBackupEvent {
  type: EventType.LOAD_PROJECT_KMS_BACKUP;
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

interface OrgAdminAccessProjectEvent {
  type: EventType.ORG_ADMIN_ACCESS_PROJECT;
  metadata: {
    userId: string;
    username: string;
    email: string;
    projectId: string;
  }; // no metadata yet
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

interface AttemptCreateSlackIntegration {
  type: EventType.ATTEMPT_CREATE_SLACK_INTEGRATION;
  metadata: {
    slug: string;
    description?: string;
  };
}

interface AttemptReinstallSlackIntegration {
  type: EventType.ATTEMPT_REINSTALL_SLACK_INTEGRATION;
  metadata: {
    id: string;
  };
}

interface UpdateSlackIntegration {
  type: EventType.UPDATE_SLACK_INTEGRATION;
  metadata: {
    id: string;
    slug: string;
    description?: string;
  };
}

interface DeleteSlackIntegration {
  type: EventType.DELETE_SLACK_INTEGRATION;
  metadata: {
    id: string;
  };
}

interface GetSlackIntegration {
  type: EventType.GET_SLACK_INTEGRATION;
  metadata: {
    id: string;
  };
}

interface UpdateProjectSlackConfig {
  type: EventType.UPDATE_PROJECT_SLACK_CONFIG;
  metadata: {
    id: string;
    slackIntegrationId: string;
    isAccessRequestNotificationEnabled: boolean;
    accessRequestChannels: string;
    isSecretRequestNotificationEnabled: boolean;
    secretRequestChannels: string;
  };
}

interface GetProjectSlackConfig {
  type: EventType.GET_PROJECT_SLACK_CONFIG;
  metadata: {
    id: string;
  };
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

export type Event =
  | GetSecretsEvent
  | GetSecretEvent
  | CreateSecretEvent
  | CreateSecretBatchEvent
  | UpdateSecretEvent
  | UpdateSecretBatchEvent
  | MoveSecretsEvent
  | DeleteSecretEvent
  | DeleteSecretBatchEvent
  | GetWorkspaceKeyEvent
  | AuthorizeIntegrationEvent
  | UnauthorizeIntegrationEvent
  | CreateIntegrationEvent
  | DeleteIntegrationEvent
  | ManualSyncIntegrationEvent
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
  | DeleteIdentityUniversalAuthEvent
  | GetIdentityUniversalAuthEvent
  | CreateTokenIdentityTokenAuthEvent
  | UpdateTokenIdentityTokenAuthEvent
  | GetTokensIdentityTokenAuthEvent
  | AddIdentityTokenAuthEvent
  | UpdateIdentityTokenAuthEvent
  | GetIdentityTokenAuthEvent
  | DeleteIdentityTokenAuthEvent
  | LoginIdentityKubernetesAuthEvent
  | DeleteIdentityKubernetesAuthEvent
  | AddIdentityKubernetesAuthEvent
  | UpdateIdentityKubernetesAuthEvent
  | GetIdentityKubernetesAuthEvent
  | CreateIdentityUniversalAuthClientSecretEvent
  | GetIdentityUniversalAuthClientSecretsEvent
  | GetIdentityUniversalAuthClientSecretByIdEvent
  | RevokeIdentityUniversalAuthClientSecretEvent
  | LoginIdentityGcpAuthEvent
  | AddIdentityGcpAuthEvent
  | DeleteIdentityGcpAuthEvent
  | UpdateIdentityGcpAuthEvent
  | GetIdentityGcpAuthEvent
  | LoginIdentityAwsAuthEvent
  | AddIdentityAwsAuthEvent
  | UpdateIdentityAwsAuthEvent
  | GetIdentityAwsAuthEvent
  | DeleteIdentityAwsAuthEvent
  | LoginIdentityAzureAuthEvent
  | AddIdentityAzureAuthEvent
  | DeleteIdentityAzureAuthEvent
  | UpdateIdentityAzureAuthEvent
  | GetIdentityAzureAuthEvent
  | LoginIdentityOidcAuthEvent
  | AddIdentityOidcAuthEvent
  | DeleteIdentityOidcAuthEvent
  | UpdateIdentityOidcAuthEvent
  | GetIdentityOidcAuthEvent
  | CreateEnvironmentEvent
  | GetEnvironmentEvent
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
  | SecretApprovalReopened
  | CreateCa
  | GetCa
  | UpdateCa
  | DeleteCa
  | RenewCa
  | GetCaCsr
  | GetCaCerts
  | GetCaCert
  | SignIntermediate
  | ImportCaCert
  | GetCaCrls
  | IssueCert
  | SignCert
  | GetCaCertificateTemplates
  | GetCert
  | DeleteCert
  | RevokeCert
  | GetCertBody
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
  | CreateKmsEvent
  | UpdateKmsEvent
  | DeleteKmsEvent
  | GetKmsEvent
  | UpdateProjectKmsEvent
  | GetProjectKmsBackupEvent
  | LoadProjectKmsBackupEvent
  | OrgAdminAccessProjectEvent
  | CreateCertificateTemplate
  | UpdateCertificateTemplate
  | GetCertificateTemplate
  | DeleteCertificateTemplate
  | CreateCertificateTemplateEstConfig
  | UpdateCertificateTemplateEstConfig
  | GetCertificateTemplateEstConfig
  | AttemptCreateSlackIntegration
  | AttemptReinstallSlackIntegration
  | UpdateSlackIntegration
  | DeleteSlackIntegration
  | GetSlackIntegration
  | UpdateProjectSlackConfig
  | GetProjectSlackConfig
  | IntegrationSyncedEvent;
