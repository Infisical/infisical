import {
  TCreateProjectTemplateDTO,
  TUpdateProjectTemplateDTO
} from "@app/ee/services/project-template/project-template-types";
import { SecretRotation, SecretRotationStatus } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  TCreateSecretRotationV2DTO,
  TDeleteSecretRotationV2DTO,
  TSecretRotationV2Raw,
  TUpdateSecretRotationV2DTO
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { SshCaStatus, SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { SshCertTemplateStatus } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-types";
import { TLoginMapping } from "@app/ee/services/ssh-host/ssh-host-types";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { TProjectPermission } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TCreateAppConnectionDTO, TUpdateAppConnectionDTO } from "@app/services/app-connection/app-connection-types";
import { ActorType } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-types";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { PkiItemType } from "@app/services/pki-collection/pki-collection-types";
import { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";
import {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TSecretSyncRaw,
  TUpdateSecretSyncDTO
} from "@app/services/secret-sync/secret-sync-types";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { KmipPermission } from "../kmip/kmip-enum";
import { ApprovalStatus } from "../secret-approval-request/secret-approval-request-types";
import { TAllowedFields } from "@app/services/identity-ldap-auth/identity-ldap-auth-types";

export type TListProjectAuditLogDTO = {
  filter: {
    userAgentType?: UserAgentType;
    eventType?: EventType[];
    offset?: number;
    limit: number;
    endDate?: string;
    startDate?: string;
    projectId?: string;
    environment?: string;
    auditLogActorId?: string;
    actorType?: ActorType;
    secretPath?: string;
    secretKey?: string;
    eventMetadata?: Record<string, string>;
  };
} & Omit<TProjectPermission, "projectId">;

export type TCreateAuditLogDTO = {
  event: Event;
  actor:
    | UserActor
    | IdentityActor
    | ServiceActor
    | ScimClientActor
    | PlatformActor
    | UnknownUserActor
    | KmipClientActor;
  orgId?: string;
  projectId?: string;
} & BaseAuthData;

export type AuditLogInfo = Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;

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
  UPDATE_INTEGRATION_AUTH = "update-integration-auth",
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

  LOGIN_IDENTITY_JWT_AUTH = "login-identity-jwt-auth",
  ADD_IDENTITY_JWT_AUTH = "add-identity-jwt-auth",
  UPDATE_IDENTITY_JWT_AUTH = "update-identity-jwt-auth",
  GET_IDENTITY_JWT_AUTH = "get-identity-jwt-auth",
  REVOKE_IDENTITY_JWT_AUTH = "revoke-identity-jwt-auth",

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

  LOGIN_IDENTITY_LDAP_AUTH = "login-identity-ldap-auth",
  ADD_IDENTITY_LDAP_AUTH = "add-identity-ldap-auth",
  UPDATE_IDENTITY_LDAP_AUTH = "update-identity-ldap-auth",
  GET_IDENTITY_LDAP_AUTH = "get-identity-ldap-auth",
  REVOKE_IDENTITY_LDAP_AUTH = "revoke-identity-ldap-auth",

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
  GET_SECRET_IMPORT = "get-secret-import",
  CREATE_SECRET_IMPORT = "create-secret-import",
  UPDATE_SECRET_IMPORT = "update-secret-import",
  DELETE_SECRET_IMPORT = "delete-secret-import",
  UPDATE_USER_WORKSPACE_ROLE = "update-user-workspace-role",
  UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS = "update-user-workspace-denied-permissions",
  SECRET_APPROVAL_MERGED = "secret-approval-merged",
  SECRET_APPROVAL_REQUEST = "secret-approval-request",
  SECRET_APPROVAL_CLOSED = "secret-approval-closed",
  SECRET_APPROVAL_REOPENED = "secret-approval-reopened",
  SECRET_APPROVAL_REQUEST_REVIEW = "secret-approval-request-review",
  SIGN_SSH_KEY = "sign-ssh-key",
  ISSUE_SSH_CREDS = "issue-ssh-creds",
  CREATE_SSH_CA = "create-ssh-certificate-authority",
  GET_SSH_CA = "get-ssh-certificate-authority",
  UPDATE_SSH_CA = "update-ssh-certificate-authority",
  DELETE_SSH_CA = "delete-ssh-certificate-authority",
  GET_SSH_CA_CERTIFICATE_TEMPLATES = "get-ssh-certificate-authority-certificate-templates",
  CREATE_SSH_CERTIFICATE_TEMPLATE = "create-ssh-certificate-template",
  UPDATE_SSH_CERTIFICATE_TEMPLATE = "update-ssh-certificate-template",
  DELETE_SSH_CERTIFICATE_TEMPLATE = "delete-ssh-certificate-template",
  GET_SSH_CERTIFICATE_TEMPLATE = "get-ssh-certificate-template",
  GET_SSH_HOST = "get-ssh-host",
  CREATE_SSH_HOST = "create-ssh-host",
  UPDATE_SSH_HOST = "update-ssh-host",
  DELETE_SSH_HOST = "delete-ssh-host",
  ISSUE_SSH_HOST_USER_CERT = "issue-ssh-host-user-cert",
  ISSUE_SSH_HOST_HOST_CERT = "issue-ssh-host-host-cert",
  GET_SSH_HOST_GROUP = "get-ssh-host-group",
  CREATE_SSH_HOST_GROUP = "create-ssh-host-group",
  UPDATE_SSH_HOST_GROUP = "update-ssh-host-group",
  DELETE_SSH_HOST_GROUP = "delete-ssh-host-group",
  GET_SSH_HOST_GROUP_HOSTS = "get-ssh-host-group-hosts",
  ADD_HOST_TO_SSH_HOST_GROUP = "add-host-to-ssh-host-group",
  REMOVE_HOST_FROM_SSH_HOST_GROUP = "remove-host-from-ssh-host-group",
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
  GET_CERT_PRIVATE_KEY = "get-cert-private-key",
  GET_CERT_BUNDLE = "get-cert-bundle",
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
  ORG_ADMIN_BYPASS_SSO = "org-admin-bypassed-sso",
  CREATE_CERTIFICATE_TEMPLATE = "create-certificate-template",
  UPDATE_CERTIFICATE_TEMPLATE = "update-certificate-template",
  DELETE_CERTIFICATE_TEMPLATE = "delete-certificate-template",
  GET_CERTIFICATE_TEMPLATE = "get-certificate-template",
  CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG = "create-certificate-template-est-config",
  UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG = "update-certificate-template-est-config",
  GET_CERTIFICATE_TEMPLATE_EST_CONFIG = "get-certificate-template-est-config",
  ATTEMPT_CREATE_SLACK_INTEGRATION = "attempt-create-slack-integration",
  ATTEMPT_REINSTALL_SLACK_INTEGRATION = "attempt-reinstall-slack-integration",
  GET_PROJECT_SLACK_CONFIG = "get-project-slack-config",
  UPDATE_PROJECT_SLACK_CONFIG = "update-project-slack-config",
  GET_SLACK_INTEGRATION = "get-slack-integration",
  UPDATE_SLACK_INTEGRATION = "update-slack-integration",
  DELETE_SLACK_INTEGRATION = "delete-slack-integration",
  GET_PROJECT_WORKFLOW_INTEGRATION_CONFIG = "get-project-workflow-integration-config",
  UPDATE_PROJECT_WORKFLOW_INTEGRATION_CONFIG = "update-project-workflow-integration-config",

  GET_PROJECT_SSH_CONFIG = "get-project-ssh-config",
  UPDATE_PROJECT_SSH_CONFIG = "update-project-ssh-config",
  INTEGRATION_SYNCED = "integration-synced",
  CREATE_CMEK = "create-cmek",
  UPDATE_CMEK = "update-cmek",
  DELETE_CMEK = "delete-cmek",
  GET_CMEKS = "get-cmeks",
  GET_CMEK = "get-cmek",
  CMEK_ENCRYPT = "cmek-encrypt",
  CMEK_DECRYPT = "cmek-decrypt",
  CMEK_SIGN = "cmek-sign",
  CMEK_VERIFY = "cmek-verify",
  CMEK_LIST_SIGNING_ALGORITHMS = "cmek-list-signing-algorithms",
  CMEK_GET_PUBLIC_KEY = "cmek-get-public-key",

  UPDATE_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS = "update-external-group-org-role-mapping",
  GET_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS = "get-external-group-org-role-mapping",
  GET_PROJECT_TEMPLATES = "get-project-templates",
  GET_PROJECT_TEMPLATE = "get-project-template",
  CREATE_PROJECT_TEMPLATE = "create-project-template",
  UPDATE_PROJECT_TEMPLATE = "update-project-template",
  DELETE_PROJECT_TEMPLATE = "delete-project-template",
  APPLY_PROJECT_TEMPLATE = "apply-project-template",
  GET_APP_CONNECTIONS = "get-app-connections",
  GET_AVAILABLE_APP_CONNECTIONS_DETAILS = "get-available-app-connections-details",
  GET_APP_CONNECTION = "get-app-connection",
  CREATE_APP_CONNECTION = "create-app-connection",
  UPDATE_APP_CONNECTION = "update-app-connection",
  DELETE_APP_CONNECTION = "delete-app-connection",
  CREATE_SHARED_SECRET = "create-shared-secret",
  CREATE_SECRET_REQUEST = "create-secret-request",
  DELETE_SHARED_SECRET = "delete-shared-secret",
  READ_SHARED_SECRET = "read-shared-secret",
  GET_SECRET_SYNCS = "get-secret-syncs",
  GET_SECRET_SYNC = "get-secret-sync",
  CREATE_SECRET_SYNC = "create-secret-sync",
  UPDATE_SECRET_SYNC = "update-secret-sync",
  DELETE_SECRET_SYNC = "delete-secret-sync",
  SECRET_SYNC_SYNC_SECRETS = "secret-sync-sync-secrets",
  SECRET_SYNC_IMPORT_SECRETS = "secret-sync-import-secrets",
  SECRET_SYNC_REMOVE_SECRETS = "secret-sync-remove-secrets",
  OIDC_GROUP_MEMBERSHIP_MAPPING_ASSIGN_USER = "oidc-group-membership-mapping-assign-user",
  OIDC_GROUP_MEMBERSHIP_MAPPING_REMOVE_USER = "oidc-group-membership-mapping-remove-user",
  CREATE_KMIP_CLIENT = "create-kmip-client",
  UPDATE_KMIP_CLIENT = "update-kmip-client",
  DELETE_KMIP_CLIENT = "delete-kmip-client",
  GET_KMIP_CLIENT = "get-kmip-client",
  GET_KMIP_CLIENTS = "get-kmip-clients",
  CREATE_KMIP_CLIENT_CERTIFICATE = "create-kmip-client-certificate",

  SETUP_KMIP = "setup-kmip",
  GET_KMIP = "get-kmip",
  REGISTER_KMIP_SERVER = "register-kmip-server",

  KMIP_OPERATION_CREATE = "kmip-operation-create",
  KMIP_OPERATION_GET = "kmip-operation-get",
  KMIP_OPERATION_DESTROY = "kmip-operation-destroy",
  KMIP_OPERATION_GET_ATTRIBUTES = "kmip-operation-get-attributes",
  KMIP_OPERATION_ACTIVATE = "kmip-operation-activate",
  KMIP_OPERATION_REVOKE = "kmip-operation-revoke",
  KMIP_OPERATION_LOCATE = "kmip-operation-locate",
  KMIP_OPERATION_REGISTER = "kmip-operation-register",

  GET_SECRET_ROTATIONS = "get-secret-rotations",
  GET_SECRET_ROTATION = "get-secret-rotation",
  GET_SECRET_ROTATION_GENERATED_CREDENTIALS = "get-secret-rotation-generated-credentials",
  CREATE_SECRET_ROTATION = "create-secret-rotation",
  UPDATE_SECRET_ROTATION = "update-secret-rotation",
  DELETE_SECRET_ROTATION = "delete-secret-rotation",
  SECRET_ROTATION_ROTATE_SECRETS = "secret-rotation-rotate-secrets",

  PROJECT_ACCESS_REQUEST = "project-access-request",

  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CREATE = "microsoft-teams-workflow-integration-create",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_DELETE = "microsoft-teams-workflow-integration-delete",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_UPDATE = "microsoft-teams-workflow-integration-update",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CHECK_INSTALLATION_STATUS = "microsoft-teams-workflow-integration-check-installation-status",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET_TEAMS = "microsoft-teams-workflow-integration-get-teams",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET = "microsoft-teams-workflow-integration-get",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_LIST = "microsoft-teams-workflow-integration-list",

  PROJECT_ASSUME_PRIVILEGE_SESSION_START = "project-assume-privileges-session-start",
  PROJECT_ASSUME_PRIVILEGE_SESSION_END = "project-assume-privileges-session-end"
}

export const filterableSecretEvents: EventType[] = [
  EventType.GET_SECRET,
  EventType.DELETE_SECRETS,
  EventType.CREATE_SECRETS,
  EventType.UPDATE_SECRETS,
  EventType.CREATE_SECRET,
  EventType.UPDATE_SECRET,
  EventType.DELETE_SECRET
];

interface UserActorMetadata {
  userId: string;
  email?: string | null;
  username: string;
  permission?: Record<string, unknown>;
}

interface ServiceActorMetadata {
  serviceId: string;
  name: string;
}

interface IdentityActorMetadata {
  identityId: string;
  name: string;
  permission?: Record<string, unknown>;
}

interface ScimClientActorMetadata {}

interface PlatformActorMetadata {}

interface KmipClientActorMetadata {
  clientId: string;
  name: string;
}

interface UnknownUserActorMetadata {}

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

export interface KmipClientActor {
  type: ActorType.KMIP_CLIENT;
  metadata: KmipClientActorMetadata;
}

export interface UnknownUserActor {
  type: ActorType.UNKNOWN_USER;
  metadata: UnknownUserActorMetadata;
}

export interface IdentityActor {
  type: ActorType.IDENTITY;
  metadata: IdentityActorMetadata;
}

export interface ScimClientActor {
  type: ActorType.SCIM_CLIENT;
  metadata: ScimClientActorMetadata;
}

export type Actor = UserActor | ServiceActor | IdentityActor | ScimClientActor | PlatformActor | KmipClientActor;

interface GetSecretsEvent {
  type: EventType.GET_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
  };
}

type TSecretMetadata = { key: string; value: string }[];

interface GetSecretEvent {
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

interface CreateSecretEvent {
  type: EventType.CREATE_SECRET;
  metadata: {
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    secretVersion: number;
    secretMetadata?: TSecretMetadata;
  };
}

interface CreateSecretBatchEvent {
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
    }>;
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
    secretMetadata?: TSecretMetadata;
  };
}

interface UpdateSecretBatchEvent {
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
    }>;
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

interface UpdateIntegrationAuthEvent {
  type: EventType.UPDATE_INTEGRATION_AUTH;
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
    allowedServiceAccounts?: string | null;
    allowedProjects?: string | null;
    allowedZones?: string | null;
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
    allowedServiceAccounts?: string | null;
    allowedProjects?: string | null;
    allowedZones?: string | null;
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

interface LoginIdentityLdapAuthEvent {
  type: EventType.LOGIN_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
    ldapUsername: string;
    ldapEmail?: string;
  };
}

interface AddIdentityLdapAuthEvent {
  type: EventType.ADD_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
    allowedFields?: TAllowedFields[];
    url: string;
  };
}

interface UpdateIdentityLdapAuthEvent {
  type: EventType.UPDATE_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
    allowedFields?: TAllowedFields[];
    url?: string;
  };
}

interface GetIdentityLdapAuthEvent {
  type: EventType.GET_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
  };
}

interface RevokeIdentityLdapAuthEvent {
  type: EventType.REVOKE_IDENTITY_LDAP_AUTH;
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
    oidcClaimsReceived: Record<string, unknown>;
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
    claimMetadataMapping: Record<string, string>;
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
    claimMetadataMapping?: Record<string, string>;
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

interface LoginIdentityJwtAuthEvent {
  type: EventType.LOGIN_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
    identityJwtAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityJwtAuthEvent {
  type: EventType.ADD_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
    configurationType: string;
    jwksUrl?: string;
    jwksCaCert: string;
    publicKeys: string[];
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

interface UpdateIdentityJwtAuthEvent {
  type: EventType.UPDATE_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
    configurationType?: string;
    jwksUrl?: string;
    jwksCaCert?: string;
    publicKeys?: string[];
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

interface DeleteIdentityJwtAuthEvent {
  type: EventType.REVOKE_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
  };
}

interface GetIdentityJwtAuthEvent {
  type: EventType.GET_IDENTITY_JWT_AUTH;
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
    description?: string;
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

interface GetSecretImportEvent {
  type: EventType.GET_SECRET_IMPORT;
  metadata: {
    secretImportId: string;
    folderId: string;
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

interface SecretApprovalRequestReview {
  type: EventType.SECRET_APPROVAL_REQUEST_REVIEW;
  metadata: {
    secretApprovalRequestId: string;
    reviewedBy: string;
    status: ApprovalStatus;
    comment: string;
  };
}

interface SignSshKey {
  type: EventType.SIGN_SSH_KEY;
  metadata: {
    certificateTemplateId: string;
    certType: SshCertType;
    principals: string[];
    ttl: string;
    keyId: string;
  };
}

interface IssueSshCreds {
  type: EventType.ISSUE_SSH_CREDS;
  metadata: {
    certificateTemplateId: string;
    keyAlgorithm: SshCertKeyAlgorithm;
    certType: SshCertType;
    principals: string[];
    ttl: string;
    keyId: string;
  };
}

interface CreateSshCa {
  type: EventType.CREATE_SSH_CA;
  metadata: {
    sshCaId: string;
    friendlyName: string;
  };
}

interface GetSshCa {
  type: EventType.GET_SSH_CA;
  metadata: {
    sshCaId: string;
    friendlyName: string;
  };
}

interface UpdateSshCa {
  type: EventType.UPDATE_SSH_CA;
  metadata: {
    sshCaId: string;
    friendlyName: string;
    status: SshCaStatus;
  };
}

interface DeleteSshCa {
  type: EventType.DELETE_SSH_CA;
  metadata: {
    sshCaId: string;
    friendlyName: string;
  };
}

interface GetSshCaCertificateTemplates {
  type: EventType.GET_SSH_CA_CERTIFICATE_TEMPLATES;
  metadata: {
    sshCaId: string;
    friendlyName: string;
  };
}

interface CreateSshCertificateTemplate {
  type: EventType.CREATE_SSH_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
    sshCaId: string;
    name: string;
    ttl: string;
    maxTTL: string;
    allowedUsers: string[];
    allowedHosts: string[];
    allowUserCertificates: boolean;
    allowHostCertificates: boolean;
    allowCustomKeyIds: boolean;
  };
}

interface GetSshCertificateTemplate {
  type: EventType.GET_SSH_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
  };
}

interface UpdateSshCertificateTemplate {
  type: EventType.UPDATE_SSH_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
    sshCaId: string;
    name: string;
    status: SshCertTemplateStatus;
    ttl: string;
    maxTTL: string;
    allowedUsers: string[];
    allowedHosts: string[];
    allowUserCertificates: boolean;
    allowHostCertificates: boolean;
    allowCustomKeyIds: boolean;
  };
}

interface DeleteSshCertificateTemplate {
  type: EventType.DELETE_SSH_CERTIFICATE_TEMPLATE;
  metadata: {
    certificateTemplateId: string;
  };
}

interface CreateSshHost {
  type: EventType.CREATE_SSH_HOST;
  metadata: {
    sshHostId: string;
    hostname: string;
    alias: string | null;
    userCertTtl: string;
    hostCertTtl: string;
    loginMappings: TLoginMapping[];
    userSshCaId: string;
    hostSshCaId: string;
  };
}

interface UpdateSshHost {
  type: EventType.UPDATE_SSH_HOST;
  metadata: {
    sshHostId: string;
    hostname?: string;
    alias?: string | null;
    userCertTtl?: string;
    hostCertTtl?: string;
    loginMappings?: TLoginMapping[];
    userSshCaId?: string;
    hostSshCaId?: string;
  };
}

interface DeleteSshHost {
  type: EventType.DELETE_SSH_HOST;
  metadata: {
    sshHostId: string;
    hostname: string;
  };
}

interface GetSshHost {
  type: EventType.GET_SSH_HOST;
  metadata: {
    sshHostId: string;
    hostname: string;
  };
}

interface IssueSshHostUserCert {
  type: EventType.ISSUE_SSH_HOST_USER_CERT;
  metadata: {
    sshHostId: string;
    hostname: string;
    loginUser: string;
    principals: string[];
    ttl: string;
  };
}

interface IssueSshHostHostCert {
  type: EventType.ISSUE_SSH_HOST_HOST_CERT;
  metadata: {
    sshHostId: string;
    hostname: string;
    serialNumber: string;
    principals: string[];
    ttl: string;
  };
}

interface GetSshHostGroupEvent {
  type: EventType.GET_SSH_HOST_GROUP;
  metadata: {
    sshHostGroupId: string;
    name: string;
  };
}

interface CreateSshHostGroupEvent {
  type: EventType.CREATE_SSH_HOST_GROUP;
  metadata: {
    sshHostGroupId: string;
    name: string;
    loginMappings: TLoginMapping[];
  };
}

interface UpdateSshHostGroupEvent {
  type: EventType.UPDATE_SSH_HOST_GROUP;
  metadata: {
    sshHostGroupId: string;
    name?: string;
    loginMappings?: TLoginMapping[];
  };
}

interface DeleteSshHostGroupEvent {
  type: EventType.DELETE_SSH_HOST_GROUP;
  metadata: {
    sshHostGroupId: string;
    name: string;
  };
}

interface GetSshHostGroupHostsEvent {
  type: EventType.GET_SSH_HOST_GROUP_HOSTS;
  metadata: {
    sshHostGroupId: string;
    name: string;
  };
}

interface AddHostToSshHostGroupEvent {
  type: EventType.ADD_HOST_TO_SSH_HOST_GROUP;
  metadata: {
    sshHostGroupId: string;
    sshHostId: string;
    hostname: string;
  };
}

interface RemoveHostFromSshHostGroupEvent {
  type: EventType.REMOVE_HOST_FROM_SSH_HOST_GROUP;
  metadata: {
    sshHostGroupId: string;
    sshHostId: string;
    hostname: string;
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

interface CreateKmsEvent {
  type: EventType.CREATE_KMS;
  metadata: {
    kmsId: string;
    provider: string;
    name: string;
    description?: string;
  };
}

interface DeleteKmsEvent {
  type: EventType.DELETE_KMS;
  metadata: {
    kmsId: string;
    name: string;
  };
}

interface UpdateKmsEvent {
  type: EventType.UPDATE_KMS;
  metadata: {
    kmsId: string;
    provider: string;
    name?: string;
    description?: string;
  };
}

interface GetKmsEvent {
  type: EventType.GET_KMS;
  metadata: {
    kmsId: string;
    name: string;
  };
}

interface UpdateProjectKmsEvent {
  type: EventType.UPDATE_PROJECT_KMS;
  metadata: {
    secretManagerKmsKey: {
      id: string;
      name: string;
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

interface OrgAdminBypassSSOEvent {
  type: EventType.ORG_ADMIN_BYPASS_SSO;
  metadata: Record<string, string>; // no metadata yet
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

interface UpdateProjectWorkflowIntegrationConfig {
  type: EventType.UPDATE_PROJECT_WORKFLOW_INTEGRATION_CONFIG;
  metadata: {
    id: string;
    integrationId: string;
    integration: WorkflowIntegration;
    isAccessRequestNotificationEnabled: boolean;
    accessRequestChannels?: string | { teamId: string; channelIds: string[] };
    isSecretRequestNotificationEnabled: boolean;
    secretRequestChannels?: string | { teamId: string; channelIds: string[] };
  };
}

interface GetProjectWorkflowIntegrationConfig {
  type: EventType.GET_PROJECT_WORKFLOW_INTEGRATION_CONFIG;
  metadata: {
    id: string;
    integration: WorkflowIntegration;
  };
}

interface GetProjectSshConfig {
  type: EventType.GET_PROJECT_SSH_CONFIG;
  metadata: {
    id: string;
    projectId: string;
  };
}

interface UpdateProjectSshConfig {
  type: EventType.UPDATE_PROJECT_SSH_CONFIG;
  metadata: {
    id: string;
    projectId: string;
    defaultUserSshCaId?: string | null;
    defaultHostSshCaId?: string | null;
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

interface CreateCmekEvent {
  type: EventType.CREATE_CMEK;
  metadata: {
    keyId: string;
    name: string;
    description?: string;
    encryptionAlgorithm: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm;
  };
}

interface DeleteCmekEvent {
  type: EventType.DELETE_CMEK;
  metadata: {
    keyId: string;
  };
}

interface UpdateCmekEvent {
  type: EventType.UPDATE_CMEK;
  metadata: {
    keyId: string;
    name?: string;
    description?: string;
  };
}

interface GetCmeksEvent {
  type: EventType.GET_CMEKS;
  metadata: {
    keyIds: string[];
  };
}

interface GetCmekEvent {
  type: EventType.GET_CMEK;
  metadata: {
    keyId: string;
  };
}

interface CmekEncryptEvent {
  type: EventType.CMEK_ENCRYPT;
  metadata: {
    keyId: string;
  };
}

interface CmekDecryptEvent {
  type: EventType.CMEK_DECRYPT;
  metadata: {
    keyId: string;
  };
}

interface CmekSignEvent {
  type: EventType.CMEK_SIGN;
  metadata: {
    keyId: string;
    signingAlgorithm: SigningAlgorithm;
    signature: string;
  };
}

interface CmekVerifyEvent {
  type: EventType.CMEK_VERIFY;
  metadata: {
    keyId: string;
    signingAlgorithm: SigningAlgorithm;
    signature: string;
    signatureValid: boolean;
  };
}

interface CmekListSigningAlgorithmsEvent {
  type: EventType.CMEK_LIST_SIGNING_ALGORITHMS;
  metadata: {
    keyId: string;
  };
}

interface CmekGetPublicKeyEvent {
  type: EventType.CMEK_GET_PUBLIC_KEY;
  metadata: {
    keyId: string;
  };
}

interface GetExternalGroupOrgRoleMappingsEvent {
  type: EventType.GET_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS;
  metadata?: Record<string, never>; // not needed, based off orgId
}

interface UpdateExternalGroupOrgRoleMappingsEvent {
  type: EventType.UPDATE_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS;
  metadata: {
    mappings: { groupName: string; roleSlug: string }[];
  };
}

interface GetProjectTemplatesEvent {
  type: EventType.GET_PROJECT_TEMPLATES;
  metadata: {
    count: number;
    templateIds: string[];
  };
}

interface GetProjectTemplateEvent {
  type: EventType.GET_PROJECT_TEMPLATE;
  metadata: {
    templateId: string;
  };
}

interface CreateProjectTemplateEvent {
  type: EventType.CREATE_PROJECT_TEMPLATE;
  metadata: TCreateProjectTemplateDTO;
}

interface UpdateProjectTemplateEvent {
  type: EventType.UPDATE_PROJECT_TEMPLATE;
  metadata: TUpdateProjectTemplateDTO & { templateId: string };
}

interface DeleteProjectTemplateEvent {
  type: EventType.DELETE_PROJECT_TEMPLATE;
  metadata: {
    templateId: string;
  };
}

interface ApplyProjectTemplateEvent {
  type: EventType.APPLY_PROJECT_TEMPLATE;
  metadata: {
    template: string;
    projectId: string;
  };
}

interface GetAppConnectionsEvent {
  type: EventType.GET_APP_CONNECTIONS;
  metadata: {
    app?: AppConnection;
    count: number;
    connectionIds: string[];
  };
}

interface GetAvailableAppConnectionsDetailsEvent {
  type: EventType.GET_AVAILABLE_APP_CONNECTIONS_DETAILS;
  metadata: {
    app?: AppConnection;
    count: number;
    connectionIds: string[];
  };
}

interface GetAppConnectionEvent {
  type: EventType.GET_APP_CONNECTION;
  metadata: {
    connectionId: string;
  };
}

interface CreateAppConnectionEvent {
  type: EventType.CREATE_APP_CONNECTION;
  metadata: Omit<TCreateAppConnectionDTO, "credentials"> & { connectionId: string };
}

interface UpdateAppConnectionEvent {
  type: EventType.UPDATE_APP_CONNECTION;
  metadata: Omit<TUpdateAppConnectionDTO, "credentials"> & { connectionId: string; credentialsUpdated: boolean };
}

interface DeleteAppConnectionEvent {
  type: EventType.DELETE_APP_CONNECTION;
  metadata: {
    connectionId: string;
  };
}

interface CreateSharedSecretEvent {
  type: EventType.CREATE_SHARED_SECRET;
  metadata: {
    id: string;
    accessType: string;
    name?: string;
    expiresAfterViews?: number;
    usingPassword: boolean;
    expiresAt: string;
  };
}

interface CreateSecretRequestEvent {
  type: EventType.CREATE_SECRET_REQUEST;
  metadata: {
    id: string;
    accessType: string;
    name?: string;
  };
}

interface DeleteSharedSecretEvent {
  type: EventType.DELETE_SHARED_SECRET;
  metadata: {
    id: string;
    name?: string;
  };
}

interface ReadSharedSecretEvent {
  type: EventType.READ_SHARED_SECRET;
  metadata: {
    id: string;
    name?: string;
    accessType: string;
  };
}

interface GetSecretSyncsEvent {
  type: EventType.GET_SECRET_SYNCS;
  metadata: {
    destination?: SecretSync;
    count: number;
    syncIds: string[];
  };
}

interface GetSecretSyncEvent {
  type: EventType.GET_SECRET_SYNC;
  metadata: {
    destination: SecretSync;
    syncId: string;
  };
}

interface CreateSecretSyncEvent {
  type: EventType.CREATE_SECRET_SYNC;
  metadata: Omit<TCreateSecretSyncDTO, "projectId"> & { syncId: string };
}

interface UpdateSecretSyncEvent {
  type: EventType.UPDATE_SECRET_SYNC;
  metadata: TUpdateSecretSyncDTO;
}

interface DeleteSecretSyncEvent {
  type: EventType.DELETE_SECRET_SYNC;
  metadata: TDeleteSecretSyncDTO;
}

interface SecretSyncSyncSecretsEvent {
  type: EventType.SECRET_SYNC_SYNC_SECRETS;
  metadata: Pick<
    TSecretSyncRaw,
    "syncOptions" | "destinationConfig" | "destination" | "syncStatus" | "connectionId" | "folderId"
  > & {
    syncId: string;
    syncMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

interface SecretSyncImportSecretsEvent {
  type: EventType.SECRET_SYNC_IMPORT_SECRETS;
  metadata: Pick<
    TSecretSyncRaw,
    "syncOptions" | "destinationConfig" | "destination" | "importStatus" | "connectionId" | "folderId"
  > & {
    syncId: string;
    importMessage: string | null;
    jobId: string;
    jobRanAt: Date;
    importBehavior: SecretSyncImportBehavior;
  };
}

interface SecretSyncRemoveSecretsEvent {
  type: EventType.SECRET_SYNC_REMOVE_SECRETS;
  metadata: Pick<
    TSecretSyncRaw,
    "syncOptions" | "destinationConfig" | "destination" | "removeStatus" | "connectionId" | "folderId"
  > & {
    syncId: string;
    removeMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

interface OidcGroupMembershipMappingAssignUserEvent {
  type: EventType.OIDC_GROUP_MEMBERSHIP_MAPPING_ASSIGN_USER;
  metadata: {
    assignedToGroups: { id: string; name: string }[];
    userId: string;
    userEmail: string;
    userGroupsClaim: string[];
  };
}

interface OidcGroupMembershipMappingRemoveUserEvent {
  type: EventType.OIDC_GROUP_MEMBERSHIP_MAPPING_REMOVE_USER;
  metadata: {
    removedFromGroups: { id: string; name: string }[];
    userId: string;
    userEmail: string;
    userGroupsClaim: string[];
  };
}

interface CreateKmipClientEvent {
  type: EventType.CREATE_KMIP_CLIENT;
  metadata: {
    name: string;
    id: string;
    permissions: KmipPermission[];
  };
}

interface UpdateKmipClientEvent {
  type: EventType.UPDATE_KMIP_CLIENT;
  metadata: {
    name: string;
    id: string;
    permissions: KmipPermission[];
  };
}

interface DeleteKmipClientEvent {
  type: EventType.DELETE_KMIP_CLIENT;
  metadata: {
    id: string;
  };
}

interface GetKmipClientEvent {
  type: EventType.GET_KMIP_CLIENT;
  metadata: {
    id: string;
  };
}

interface GetKmipClientsEvent {
  type: EventType.GET_KMIP_CLIENTS;
  metadata: {
    ids: string[];
  };
}

interface CreateKmipClientCertificateEvent {
  type: EventType.CREATE_KMIP_CLIENT_CERTIFICATE;
  metadata: {
    clientId: string;
    ttl: string;
    keyAlgorithm: string;
    serialNumber: string;
  };
}

interface KmipOperationGetEvent {
  type: EventType.KMIP_OPERATION_GET;
  metadata: {
    id: string;
  };
}

interface KmipOperationDestroyEvent {
  type: EventType.KMIP_OPERATION_DESTROY;
  metadata: {
    id: string;
  };
}

interface KmipOperationCreateEvent {
  type: EventType.KMIP_OPERATION_CREATE;
  metadata: {
    id: string;
    algorithm: string;
  };
}

interface KmipOperationGetAttributesEvent {
  type: EventType.KMIP_OPERATION_GET_ATTRIBUTES;
  metadata: {
    id: string;
  };
}

interface KmipOperationActivateEvent {
  type: EventType.KMIP_OPERATION_ACTIVATE;
  metadata: {
    id: string;
  };
}

interface KmipOperationRevokeEvent {
  type: EventType.KMIP_OPERATION_REVOKE;
  metadata: {
    id: string;
  };
}

interface KmipOperationLocateEvent {
  type: EventType.KMIP_OPERATION_LOCATE;
  metadata: {
    ids: string[];
  };
}

interface KmipOperationRegisterEvent {
  type: EventType.KMIP_OPERATION_REGISTER;
  metadata: {
    id: string;
    algorithm: string;
    name: string;
  };
}

interface ProjectAccessRequestEvent {
  type: EventType.PROJECT_ACCESS_REQUEST;
  metadata: {
    projectId: string;
    requesterId: string;
    requesterEmail: string;
  };
}

interface ProjectAssumePrivilegesEvent {
  type: EventType.PROJECT_ASSUME_PRIVILEGE_SESSION_START;
  metadata: {
    projectId: string;
    requesterId: string;
    requesterEmail: string;
    targetActorType: ActorType;
    targetActorId: string;
    duration: string;
  };
}

interface ProjectAssumePrivilegesExitEvent {
  type: EventType.PROJECT_ASSUME_PRIVILEGE_SESSION_END;
  metadata: {
    projectId: string;
    requesterId: string;
    requesterEmail: string;
    targetActorType: ActorType;
    targetActorId: string;
  };
}

interface SetupKmipEvent {
  type: EventType.SETUP_KMIP;
  metadata: {
    keyAlgorithm: CertKeyAlgorithm;
  };
}

interface GetKmipEvent {
  type: EventType.GET_KMIP;
  metadata: {
    id: string;
  };
}

interface RegisterKmipServerEvent {
  type: EventType.REGISTER_KMIP_SERVER;
  metadata: {
    serverCertificateSerialNumber: string;
    hostnamesOrIps: string;
    commonName: string;
    keyAlgorithm: CertKeyAlgorithm;
    ttl: string;
  };
}

interface GetSecretRotationsEvent {
  type: EventType.GET_SECRET_ROTATIONS;
  metadata: {
    type?: SecretRotation;
    count: number;
    rotationIds: string[];
    secretPath?: string;
    environment?: string;
  };
}

interface GetSecretRotationEvent {
  type: EventType.GET_SECRET_ROTATION;
  metadata: {
    type: SecretRotation;
    rotationId: string;
    secretPath: string;
    environment: string;
  };
}

interface GetSecretRotationCredentialsEvent {
  type: EventType.GET_SECRET_ROTATION_GENERATED_CREDENTIALS;
  metadata: {
    type: SecretRotation;
    rotationId: string;
    secretPath: string;
    environment: string;
  };
}

interface CreateSecretRotationEvent {
  type: EventType.CREATE_SECRET_ROTATION;
  metadata: Omit<TCreateSecretRotationV2DTO, "projectId"> & { rotationId: string };
}

interface UpdateSecretRotationEvent {
  type: EventType.UPDATE_SECRET_ROTATION;
  metadata: TUpdateSecretRotationV2DTO;
}

interface DeleteSecretRotationEvent {
  type: EventType.DELETE_SECRET_ROTATION;
  metadata: TDeleteSecretRotationV2DTO;
}

interface RotateSecretRotationEvent {
  type: EventType.SECRET_ROTATION_ROTATE_SECRETS;
  metadata: Pick<TSecretRotationV2Raw, "parameters" | "secretsMapping" | "type" | "connectionId" | "folderId"> & {
    status: SecretRotationStatus;
    rotationId: string;
    jobId?: string | undefined;
    occurredAt: Date;
    message?: string | null | undefined;
  };
}

interface MicrosoftTeamsWorkflowIntegrationCreateEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CREATE;
  metadata: {
    tenantId: string;
    slug: string;
    description?: string;
  };
}

interface MicrosoftTeamsWorkflowIntegrationDeleteEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_DELETE;
  metadata: {
    tenantId: string;
    id: string;
    slug: string;
  };
}

interface MicrosoftTeamsWorkflowIntegrationCheckInstallationStatusEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CHECK_INSTALLATION_STATUS;
  metadata: {
    tenantId: string;
    slug: string;
  };
}

interface MicrosoftTeamsWorkflowIntegrationGetTeamsEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET_TEAMS;
  metadata: {
    tenantId: string;
    slug: string;
    id: string;
  };
}

interface MicrosoftTeamsWorkflowIntegrationGetEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET;
  metadata: {
    tenantId: string;
    slug: string;
    id: string;
  };
}

interface MicrosoftTeamsWorkflowIntegrationListEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_LIST;
  metadata: Record<string, string>;
}

interface MicrosoftTeamsWorkflowIntegrationUpdateEvent {
  type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_UPDATE;
  metadata: {
    tenantId: string;
    slug: string;
    id: string;
    newSlug?: string;
    newDescription?: string;
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
  | UpdateIntegrationAuthEvent
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
  | LoginIdentityJwtAuthEvent
  | AddIdentityJwtAuthEvent
  | UpdateIdentityJwtAuthEvent
  | GetIdentityJwtAuthEvent
  | DeleteIdentityJwtAuthEvent
  | LoginIdentityLdapAuthEvent
  | AddIdentityLdapAuthEvent
  | UpdateIdentityLdapAuthEvent
  | GetIdentityLdapAuthEvent
  | RevokeIdentityLdapAuthEvent
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
  | GetSecretImportEvent
  | CreateSecretImportEvent
  | UpdateSecretImportEvent
  | DeleteSecretImportEvent
  | UpdateUserRole
  | UpdateUserDeniedPermissions
  | SecretApprovalMerge
  | SecretApprovalClosed
  | SecretApprovalRequest
  | SecretApprovalReopened
  | SignSshKey
  | IssueSshCreds
  | CreateSshCa
  | GetSshCa
  | UpdateSshCa
  | DeleteSshCa
  | GetSshCaCertificateTemplates
  | CreateSshCertificateTemplate
  | UpdateSshCertificateTemplate
  | GetSshCertificateTemplate
  | DeleteSshCertificateTemplate
  | CreateSshHost
  | UpdateSshHost
  | DeleteSshHost
  | GetSshHost
  | IssueSshHostUserCert
  | IssueSshHostHostCert
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
  | CreateKmsEvent
  | UpdateKmsEvent
  | DeleteKmsEvent
  | GetKmsEvent
  | UpdateProjectKmsEvent
  | GetProjectKmsBackupEvent
  | LoadProjectKmsBackupEvent
  | OrgAdminAccessProjectEvent
  | OrgAdminBypassSSOEvent
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
  | UpdateProjectWorkflowIntegrationConfig
  | GetProjectWorkflowIntegrationConfig
  | GetProjectSshConfig
  | UpdateProjectSshConfig
  | IntegrationSyncedEvent
  | CreateCmekEvent
  | UpdateCmekEvent
  | DeleteCmekEvent
  | GetCmekEvent
  | GetCmeksEvent
  | CmekEncryptEvent
  | CmekDecryptEvent
  | CmekSignEvent
  | CmekVerifyEvent
  | CmekListSigningAlgorithmsEvent
  | CmekGetPublicKeyEvent
  | GetExternalGroupOrgRoleMappingsEvent
  | UpdateExternalGroupOrgRoleMappingsEvent
  | GetProjectTemplatesEvent
  | GetProjectTemplateEvent
  | CreateProjectTemplateEvent
  | UpdateProjectTemplateEvent
  | DeleteProjectTemplateEvent
  | ApplyProjectTemplateEvent
  | GetAppConnectionsEvent
  | GetAvailableAppConnectionsDetailsEvent
  | GetAppConnectionEvent
  | CreateAppConnectionEvent
  | UpdateAppConnectionEvent
  | DeleteAppConnectionEvent
  | GetSshHostGroupEvent
  | CreateSshHostGroupEvent
  | UpdateSshHostGroupEvent
  | DeleteSshHostGroupEvent
  | GetSshHostGroupHostsEvent
  | AddHostToSshHostGroupEvent
  | RemoveHostFromSshHostGroupEvent
  | CreateSharedSecretEvent
  | DeleteSharedSecretEvent
  | ReadSharedSecretEvent
  | GetSecretSyncsEvent
  | GetSecretSyncEvent
  | CreateSecretSyncEvent
  | UpdateSecretSyncEvent
  | DeleteSecretSyncEvent
  | SecretSyncSyncSecretsEvent
  | SecretSyncImportSecretsEvent
  | SecretSyncRemoveSecretsEvent
  | OidcGroupMembershipMappingAssignUserEvent
  | OidcGroupMembershipMappingRemoveUserEvent
  | CreateKmipClientEvent
  | UpdateKmipClientEvent
  | DeleteKmipClientEvent
  | GetKmipClientEvent
  | GetKmipClientsEvent
  | CreateKmipClientCertificateEvent
  | SetupKmipEvent
  | GetKmipEvent
  | RegisterKmipServerEvent
  | KmipOperationGetEvent
  | KmipOperationDestroyEvent
  | KmipOperationCreateEvent
  | KmipOperationGetAttributesEvent
  | KmipOperationActivateEvent
  | KmipOperationRevokeEvent
  | KmipOperationLocateEvent
  | KmipOperationRegisterEvent
  | ProjectAccessRequestEvent
  | ProjectAssumePrivilegesEvent
  | ProjectAssumePrivilegesExitEvent
  | CreateSecretRequestEvent
  | SecretApprovalRequestReview
  | GetSecretRotationsEvent
  | GetSecretRotationEvent
  | GetSecretRotationCredentialsEvent
  | CreateSecretRotationEvent
  | UpdateSecretRotationEvent
  | DeleteSecretRotationEvent
  | RotateSecretRotationEvent
  | MicrosoftTeamsWorkflowIntegrationCreateEvent
  | MicrosoftTeamsWorkflowIntegrationDeleteEvent
  | MicrosoftTeamsWorkflowIntegrationCheckInstallationStatusEvent
  | MicrosoftTeamsWorkflowIntegrationGetTeamsEvent
  | MicrosoftTeamsWorkflowIntegrationGetEvent
  | MicrosoftTeamsWorkflowIntegrationListEvent
  | MicrosoftTeamsWorkflowIntegrationUpdateEvent;
