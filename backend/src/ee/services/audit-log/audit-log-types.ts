import { ProjectType } from "@app/db/schemas";
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
import {
  SecretScanningDataSource,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TTriggerSecretScanningDataSourceDTO,
  TUpdateSecretScanningDataSourceDTO,
  TUpdateSecretScanningFindingDTO
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
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
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { TAllowedFields } from "@app/services/identity-ldap-auth/identity-ldap-auth-types";
import { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { PkiItemType } from "@app/services/pki-collection/pki-collection-types";
import { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";
import {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TSecretSyncRaw,
  TUpdateSecretSyncDTO
} from "@app/services/secret-sync/secret-sync-types";
import { TWebhookPayloads } from "@app/services/webhook/webhook-types";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { KmipPermission } from "../kmip/kmip-enum";
import { AcmeChallengeType, AcmeIdentifierType } from "../pki-acme/pki-acme-schemas";
import { ApprovalStatus } from "../secret-approval-request/secret-approval-request-types";

export type TListProjectAuditLogDTO = {
  filter: {
    userAgentType?: UserAgentType;
    eventType?: EventType[];
    offset?: number;
    limit: number;
    endDate: string;
    startDate: string;
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
    | KmipClientActor
    | AcmeProfileActor
    | AcmeAccountActor;
  orgId?: string;
  projectId?: string;
} & BaseAuthData;

export type TAuditLogServiceFactory = {
  createAuditLog: (data: TCreateAuditLogDTO) => Promise<void>;
  listAuditLogs: (arg: TListProjectAuditLogDTO) => Promise<
    {
      event: {
        type: string;
        metadata: unknown;
      };
      actor: {
        type: string;
        metadata: unknown;
      };
      id: string;
      createdAt: Date;
      updatedAt: Date;
      orgId?: string | null | undefined;
      userAgent?: string | null | undefined;
      expiresAt?: Date | null | undefined;
      ipAddress?: string | null | undefined;
      userAgentType?: string | null | undefined;
      projectId?: string | null | undefined;
      projectName?: string | null | undefined;
    }[]
  >;
};

export type AuditLogInfo = Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;

interface BaseAuthData {
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
}

export enum SecretApprovalEvent {
  Create = "create",
  Update = "update",
  Delete = "delete",
  CreateMany = "create-many",
  UpdateMany = "update-many",
  DeleteMany = "delete-many"
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
  GET_PROJECT_KEY = "get-project-key",
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

  CREATE_SUB_ORGANIZATION = "create-sub-organization",
  UPDATE_SUB_ORGANIZATION = "update-sub-organization",

  CREATE_IDENTITY = "create-identity",
  UPDATE_IDENTITY = "update-identity",
  DELETE_IDENTITY = "delete-identity",

  CREATE_IDENTITY_ORG_MEMBERSHIP = "create-identity-org-membership",
  UPDATE_IDENTITY_ORG_MEMBERSHIP = "update-identity-org-membership",
  DELETE_IDENTITY_ORG_MEMBERSHIP = "delete-identity-org-membership",

  CREATE_IDENTITY_PROJECT_MEMBERSHIP = "create-identity-project-membership",
  UPDATE_IDENTITY_PROJECT_MEMBERSHIP = "update-identity-project-membership",
  DELETE_IDENTITY_PROJECT_MEMBERSHIP = "delete-identity-project-membership",

  MACHINE_IDENTITY_AUTH_TEMPLATE_CREATE = "machine-identity-auth-template-create",
  MACHINE_IDENTITY_AUTH_TEMPLATE_UPDATE = "machine-identity-auth-template-update",
  MACHINE_IDENTITY_AUTH_TEMPLATE_DELETE = "machine-identity-auth-template-delete",
  LOGIN_IDENTITY_UNIVERSAL_AUTH = "login-identity-universal-auth",
  ADD_IDENTITY_UNIVERSAL_AUTH = "add-identity-universal-auth",
  UPDATE_IDENTITY_UNIVERSAL_AUTH = "update-identity-universal-auth",
  GET_IDENTITY_UNIVERSAL_AUTH = "get-identity-universal-auth",
  REVOKE_IDENTITY_UNIVERSAL_AUTH = "revoke-identity-universal-auth",
  CREATE_TOKEN_IDENTITY_TOKEN_AUTH = "create-token-identity-token-auth",
  UPDATE_TOKEN_IDENTITY_TOKEN_AUTH = "update-token-identity-token-auth",
  GET_TOKENS_IDENTITY_TOKEN_AUTH = "get-tokens-identity-token-auth",
  GET_TOKEN_IDENTITY_TOKEN_AUTH = "get-token-identity-token-auth",

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
  CLEAR_IDENTITY_UNIVERSAL_AUTH_LOCKOUTS = "clear-identity-universal-auth-lockouts",
  CLEAR_IDENTITY_LDAP_AUTH_LOCKOUTS = "clear-identity-ldap-auth-lockouts",

  GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS = "get-identity-universal-auth-client-secret",
  GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET_BY_ID = "get-identity-universal-auth-client-secret-by-id",

  LOGIN_IDENTITY_GCP_AUTH = "login-identity-gcp-auth",
  ADD_IDENTITY_GCP_AUTH = "add-identity-gcp-auth",
  UPDATE_IDENTITY_GCP_AUTH = "update-identity-gcp-auth",
  REVOKE_IDENTITY_GCP_AUTH = "revoke-identity-gcp-auth",
  GET_IDENTITY_GCP_AUTH = "get-identity-gcp-auth",

  LOGIN_IDENTITY_ALICLOUD_AUTH = "login-identity-alicloud-auth",
  ADD_IDENTITY_ALICLOUD_AUTH = "add-identity-alicloud-auth",
  UPDATE_IDENTITY_ALICLOUD_AUTH = "update-identity-alicloud-auth",
  REVOKE_IDENTITY_ALICLOUD_AUTH = "revoke-identity-alicloud-auth",
  GET_IDENTITY_ALICLOUD_AUTH = "get-identity-alicloud-auth",

  LOGIN_IDENTITY_TLS_CERT_AUTH = "login-identity-tls-cert-auth",
  ADD_IDENTITY_TLS_CERT_AUTH = "add-identity-tls-cert-auth",
  UPDATE_IDENTITY_TLS_CERT_AUTH = "update-identity-tls-cert-auth",
  REVOKE_IDENTITY_TLS_CERT_AUTH = "revoke-identity-tls-cert-auth",
  GET_IDENTITY_TLS_CERT_AUTH = "get-identity-tls-cert-auth",

  LOGIN_IDENTITY_AWS_AUTH = "login-identity-aws-auth",
  ADD_IDENTITY_AWS_AUTH = "add-identity-aws-auth",
  UPDATE_IDENTITY_AWS_AUTH = "update-identity-aws-auth",
  REVOKE_IDENTITY_AWS_AUTH = "revoke-identity-aws-auth",
  GET_IDENTITY_AWS_AUTH = "get-identity-aws-auth",

  LOGIN_IDENTITY_OCI_AUTH = "login-identity-oci-auth",
  ADD_IDENTITY_OCI_AUTH = "add-identity-oci-auth",
  UPDATE_IDENTITY_OCI_AUTH = "update-identity-oci-auth",
  REVOKE_IDENTITY_OCI_AUTH = "revoke-identity-oci-auth",
  GET_IDENTITY_OCI_AUTH = "get-identity-oci-auth",

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
  ADD_PROJECT_MEMBER = "add-project-member",
  ADD_BATCH_PROJECT_MEMBER = "add-project-members",
  REMOVE_PROJECT_MEMBER = "remove-project-member",
  CREATE_FOLDER = "create-folder",
  UPDATE_FOLDER = "update-folder",
  DELETE_FOLDER = "delete-folder",
  CREATE_WEBHOOK = "create-webhook",
  UPDATE_WEBHOOK_STATUS = "update-webhook-status",
  DELETE_WEBHOOK = "delete-webhook",
  WEBHOOK_TRIGGERED = "webhook-triggered",
  GET_SECRET_IMPORTS = "get-secret-imports",
  GET_SECRET_IMPORT = "get-secret-import",
  CREATE_SECRET_IMPORT = "create-secret-import",
  UPDATE_SECRET_IMPORT = "update-secret-import",
  DELETE_SECRET_IMPORT = "delete-secret-import",
  UPDATE_USER_PROJECT_ROLE = "update-user-project-role",
  UPDATE_USER_PROJECT_DENIED_PERMISSIONS = "update-user-project-denied-permissions",
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
  GET_AZURE_AD_TEMPLATES = "get-azure-ad-templates",
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
  GET_CAS = "get-certificate-authorities",
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
  IMPORT_CERT = "import-cert",
  SIGN_CERT = "sign-cert",
  GET_CA_CERTIFICATE_TEMPLATES = "get-ca-certificate-templates",
  GET_CERT = "get-cert",
  DELETE_CERT = "delete-cert",
  REVOKE_CERT = "revoke-cert",
  GET_CERT_BODY = "get-cert-body",
  GET_CERT_PRIVATE_KEY = "get-cert-private-key",
  GET_CERT_BUNDLE = "get-cert-bundle",
  EXPORT_CERT_PKCS12 = "export-cert-pkcs12",
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
  CREATE_PKI_SUBSCRIBER = "create-pki-subscriber",
  UPDATE_PKI_SUBSCRIBER = "update-pki-subscriber",
  DELETE_PKI_SUBSCRIBER = "delete-pki-subscriber",
  GET_PKI_SUBSCRIBER = "get-pki-subscriber",
  ISSUE_PKI_SUBSCRIBER_CERT = "issue-pki-subscriber-cert",
  SIGN_PKI_SUBSCRIBER_CERT = "sign-pki-subscriber-cert",
  AUTOMATED_RENEW_SUBSCRIBER_CERT = "automated-renew-subscriber-cert",
  AUTOMATED_RENEW_CERTIFICATE = "automated-renew-certificate",
  AUTOMATED_RENEW_CERTIFICATE_FAILED = "automated-renew-certificate-failed",
  LIST_PKI_SUBSCRIBER_CERTS = "list-pki-subscriber-certs",
  GET_SUBSCRIBER_ACTIVE_CERT_BUNDLE = "get-subscriber-active-cert-bundle",
  CREATE_KMS = "create-kms",
  UPDATE_KMS = "update-kms",
  DELETE_KMS = "delete-kms",
  GET_KMS = "get-kms",
  UPDATE_PROJECT_KMS = "update-project-kms",
  GET_PROJECT_KMS_BACKUP = "get-project-kms-backup",
  LOAD_PROJECT_KMS_BACKUP = "load-project-kms-backup",
  ORG_ADMIN_ACCESS_PROJECT = "org-admin-accessed-project",
  ORG_ADMIN_BYPASS_SSO = "org-admin-bypassed-sso",
  USER_LOGIN = "user-login",
  SELECT_ORGANIZATION = "select-organization",
  SELECT_SUB_ORGANIZATION = "select-sub-organization",
  CREATE_CERTIFICATE_POLICY = "create-certificate-policy",
  UPDATE_CERTIFICATE_POLICY = "update-certificate-policy",
  DELETE_CERTIFICATE_POLICY = "delete-certificate-policy",
  GET_CERTIFICATE_POLICY = "get-certificate-policy",
  LIST_CERTIFICATE_POLICIES = "list-certificate-policies",
  CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG = "create-certificate-template-est-config",
  UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG = "update-certificate-template-est-config",
  GET_CERTIFICATE_TEMPLATE_EST_CONFIG = "get-certificate-template-est-config",
  CREATE_CERTIFICATE_PROFILE = "create-certificate-profile",
  UPDATE_CERTIFICATE_PROFILE = "update-certificate-profile",
  DELETE_CERTIFICATE_PROFILE = "delete-certificate-profile",
  GET_CERTIFICATE_PROFILE = "get-certificate-profile",
  LIST_CERTIFICATE_PROFILES = "list-certificate-profiles",
  ISSUE_CERTIFICATE_FROM_PROFILE = "issue-certificate-from-profile",
  SIGN_CERTIFICATE_FROM_PROFILE = "sign-certificate-from-profile",
  ORDER_CERTIFICATE_FROM_PROFILE = "order-certificate-from-profile",
  RENEW_CERTIFICATE = "renew-certificate",
  GET_CERTIFICATE_PROFILE_LATEST_ACTIVE_BUNDLE = "get-certificate-profile-latest-active-bundle",
  UPDATE_CERTIFICATE_RENEWAL_CONFIG = "update-certificate-renewal-config",
  DISABLE_CERTIFICATE_RENEWAL_CONFIG = "disable-certificate-renewal-config",
  CREATE_CERTIFICATE_REQUEST = "create-certificate-request",
  GET_CERTIFICATE_REQUEST = "get-certificate-request",
  GET_CERTIFICATE_FROM_REQUEST = "get-certificate-from-request",
  LIST_CERTIFICATE_REQUESTS = "list-certificate-requests",
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
  CMEK_GET_PRIVATE_KEY = "cmek-get-private-key",

  UPDATE_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS = "update-external-group-org-role-mapping",
  GET_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS = "get-external-group-org-role-mapping",
  GET_PROJECT_TEMPLATES = "get-project-templates",
  GET_PROJECT_TEMPLATE = "get-project-template",
  CREATE_PROJECT_TEMPLATE = "create-project-template",
  UPDATE_PROJECT_TEMPLATE = "update-project-template",
  DELETE_PROJECT_TEMPLATE = "delete-project-template",
  GET_APP_CONNECTIONS = "get-app-connections",
  GET_AVAILABLE_APP_CONNECTIONS_DETAILS = "get-available-app-connections-details",
  GET_APP_CONNECTION = "get-app-connection",
  CREATE_APP_CONNECTION = "create-app-connection",
  UPDATE_APP_CONNECTION = "update-app-connection",
  DELETE_APP_CONNECTION = "delete-app-connection",
  GET_APP_CONNECTION_USAGE = "get-app-connection-usage",
  MIGRATE_APP_CONNECTION = "migrate-app-connection",
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
  GET_PKI_SYNCS = "get-pki-syncs",
  GET_PKI_SYNC = "get-pki-sync",
  GET_PKI_SYNC_CERTIFICATES = "get-pki-sync-certificates",
  CREATE_PKI_SYNC = "create-pki-sync",
  UPDATE_PKI_SYNC = "update-pki-sync",
  DELETE_PKI_SYNC = "delete-pki-sync",
  PKI_SYNC_SYNC_CERTIFICATES = "pki-sync-sync-certificates",
  PKI_SYNC_IMPORT_CERTIFICATES = "pki-sync-import-certificates",
  PKI_SYNC_REMOVE_CERTIFICATES = "pki-sync-remove-certificates",
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
  RECONCILE_SECRET_ROTATION = "reconcile-secret-rotation",

  PROJECT_ACCESS_REQUEST = "project-access-request",

  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CREATE = "microsoft-teams-workflow-integration-create",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_DELETE = "microsoft-teams-workflow-integration-delete",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_UPDATE = "microsoft-teams-workflow-integration-update",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CHECK_INSTALLATION_STATUS = "microsoft-teams-workflow-integration-check-installation-status",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET_TEAMS = "microsoft-teams-workflow-integration-get-teams",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET = "microsoft-teams-workflow-integration-get",
  MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_LIST = "microsoft-teams-workflow-integration-list",

  PROJECT_ASSUME_PRIVILEGE_SESSION_START = "project-assume-privileges-session-start",
  PROJECT_ASSUME_PRIVILEGE_SESSION_END = "project-assume-privileges-session-end",

  GET_PROJECT_PIT_COMMITS = "get-project-pit-commits",
  GET_PROJECT_PIT_COMMIT_CHANGES = "get-project-pit-commit-changes",
  GET_PROJECT_PIT_COMMIT_COUNT = "get-project-pit-commit-count",
  PIT_ROLLBACK_COMMIT = "pit-rollback-commit",
  PIT_REVERT_COMMIT = "pit-revert-commit",
  PIT_GET_FOLDER_STATE = "pit-get-folder-state",
  PIT_COMPARE_FOLDER_STATES = "pit-compare-folder-states",
  PIT_PROCESS_NEW_COMMIT_RAW = "pit-process-new-commit-raw",
  SECRET_SCANNING_DATA_SOURCE_LIST = "secret-scanning-data-source-list",
  SECRET_SCANNING_DATA_SOURCE_CREATE = "secret-scanning-data-source-create",
  SECRET_SCANNING_DATA_SOURCE_UPDATE = "secret-scanning-data-source-update",
  SECRET_SCANNING_DATA_SOURCE_DELETE = "secret-scanning-data-source-delete",
  SECRET_SCANNING_DATA_SOURCE_GET = "secret-scanning-data-source-get",
  SECRET_SCANNING_DATA_SOURCE_TRIGGER_SCAN = "secret-scanning-data-source-trigger-scan",
  SECRET_SCANNING_DATA_SOURCE_SCAN = "secret-scanning-data-source-scan",
  SECRET_SCANNING_RESOURCE_LIST = "secret-scanning-resource-list",
  SECRET_SCANNING_SCAN_LIST = "secret-scanning-scan-list",
  SECRET_SCANNING_FINDING_LIST = "secret-scanning-finding-list",
  SECRET_SCANNING_FINDING_UPDATE = "secret-scanning-finding-update",
  SECRET_SCANNING_CONFIG_GET = "secret-scanning-config-get",
  SECRET_SCANNING_CONFIG_UPDATE = "secret-scanning-config-update",

  UPDATE_ORG = "update-org",

  CREATE_PROJECT = "create-project",
  UPDATE_PROJECT = "update-project",
  DELETE_PROJECT = "delete-project",

  CREATE_PROJECT_ROLE = "create-project-role",
  UPDATE_PROJECT_ROLE = "update-project-role",
  DELETE_PROJECT_ROLE = "delete-project-role",

  CREATE_ORG_ROLE = "create-org-role",
  UPDATE_ORG_ROLE = "update-org-role",
  DELETE_ORG_ROLE = "delete-org-role",

  CREATE_SECRET_REMINDER = "create-secret-reminder",
  GET_SECRET_REMINDER = "get-secret-reminder",
  DELETE_SECRET_REMINDER = "delete-secret-reminder",

  DASHBOARD_LIST_SECRETS = "dashboard-list-secrets",
  DASHBOARD_GET_SECRET_VALUE = "dashboard-get-secret-value",
  DASHBOARD_GET_SECRET_VERSION_VALUE = "dashboard-get-secret-version-value",

  PAM_SESSION_CREDENTIALS_GET = "pam-session-credentials-get",
  PAM_SESSION_START = "pam-session-start",
  PAM_SESSION_LOGS_UPDATE = "pam-session-logs-update",
  PAM_SESSION_END = "pam-session-end",
  PAM_SESSION_GET = "pam-session-get",
  PAM_SESSION_LIST = "pam-session-list",
  PAM_FOLDER_CREATE = "pam-folder-create",
  PAM_FOLDER_UPDATE = "pam-folder-update",
  PAM_FOLDER_DELETE = "pam-folder-delete",
  PAM_ACCOUNT_LIST = "pam-account-list",
  PAM_ACCOUNT_ACCESS = "pam-account-access",
  PAM_ACCOUNT_CREATE = "pam-account-create",
  PAM_ACCOUNT_UPDATE = "pam-account-update",
  PAM_ACCOUNT_DELETE = "pam-account-delete",
  PAM_ACCOUNT_CREDENTIAL_ROTATION = "pam-account-credential-rotation",
  PAM_ACCOUNT_CREDENTIAL_ROTATION_FAILED = "pam-account-credential-rotation-failed",
  PAM_RESOURCE_LIST = "pam-resource-list",
  PAM_RESOURCE_GET = "pam-resource-get",
  PAM_RESOURCE_CREATE = "pam-resource-create",
  PAM_RESOURCE_UPDATE = "pam-resource-update",
  PAM_RESOURCE_DELETE = "pam-resource-delete",
  APPROVAL_POLICY_CREATE = "approval-policy-create",
  APPROVAL_POLICY_UPDATE = "approval-policy-update",
  APPROVAL_POLICY_DELETE = "approval-policy-delete",
  APPROVAL_POLICY_LIST = "approval-policy-list",
  APPROVAL_POLICY_GET = "approval-policy-get",
  APPROVAL_REQUEST_GET = "approval-request-get",
  APPROVAL_REQUEST_LIST = "approval-request-list",
  APPROVAL_REQUEST_CREATE = "approval-request-create",
  APPROVAL_REQUEST_APPROVE = "approval-request-approve",
  APPROVAL_REQUEST_REJECT = "approval-request-reject",
  APPROVAL_REQUEST_CANCEL = "approval-request-cancel",
  APPROVAL_REQUEST_GRANT_LIST = "approval-request-grant-list",
  APPROVAL_REQUEST_GRANT_GET = "approval-request-grant-get",
  APPROVAL_REQUEST_GRANT_REVOKE = "approval-request-grant-revoke",

  // PKI ACME
  CREATE_ACME_ACCOUNT = "create-acme-account",
  RETRIEVE_ACME_ACCOUNT = "retrieve-acme-account",
  CREATE_ACME_ORDER = "create-acme-order",
  FINALIZE_ACME_ORDER = "finalize-acme-order",
  DOWNLOAD_ACME_CERTIFICATE = "download-acme-certificate",
  RESPOND_TO_ACME_CHALLENGE = "respond-to-acme-challenge",
  PASS_ACME_CHALLENGE = "pass-acme-challenge",
  ATTEMPT_ACME_CHALLENGE = "attempt-acme-challenge",
  FAIL_ACME_CHALLENGE = "fail-acme-challenge",

  // MCP Endpoints
  MCP_ENDPOINT_CREATE = "mcp-endpoint-create",
  MCP_ENDPOINT_UPDATE = "mcp-endpoint-update",
  MCP_ENDPOINT_DELETE = "mcp-endpoint-delete",
  MCP_ENDPOINT_GET = "mcp-endpoint-get",
  MCP_ENDPOINT_LIST = "mcp-endpoint-list",
  MCP_ENDPOINT_LIST_TOOLS = "mcp-endpoint-list-tools",
  MCP_ENDPOINT_ENABLE_TOOL = "mcp-endpoint-enable-tool",
  MCP_ENDPOINT_DISABLE_TOOL = "mcp-endpoint-disable-tool",
  MCP_ENDPOINT_BULK_UPDATE_TOOLS = "mcp-endpoint-bulk-update-tools",
  MCP_ENDPOINT_OAUTH_CLIENT_REGISTER = "mcp-endpoint-oauth-client-register",
  MCP_ENDPOINT_OAUTH_AUTHORIZE = "mcp-endpoint-oauth-authorize",
  MCP_ENDPOINT_CONNECT = "mcp-endpoint-connect",
  MCP_ENDPOINT_SAVE_USER_CREDENTIAL = "mcp-endpoint-save-user-credential",

  // MCP Servers
  MCP_SERVER_CREATE = "mcp-server-create",
  MCP_SERVER_UPDATE = "mcp-server-update",
  MCP_SERVER_DELETE = "mcp-server-delete",
  MCP_SERVER_GET = "mcp-server-get",
  MCP_SERVER_LIST = "mcp-server-list",
  MCP_SERVER_LIST_TOOLS = "mcp-server-list-tools",
  MCP_SERVER_SYNC_TOOLS = "mcp-server-sync-tools",

  // MCP Activity Logs
  MCP_ACTIVITY_LOG_LIST = "mcp-activity-log-list",

  // Dynamic Secrets
  CREATE_DYNAMIC_SECRET = "create-dynamic-secret",
  UPDATE_DYNAMIC_SECRET = "update-dynamic-secret",
  DELETE_DYNAMIC_SECRET = "delete-dynamic-secret",
  GET_DYNAMIC_SECRET = "get-dynamic-secret",
  LIST_DYNAMIC_SECRETS = "list-dynamic-secrets",

  // Dynamic Secret Leases
  CREATE_DYNAMIC_SECRET_LEASE = "create-dynamic-secret-lease",
  DELETE_DYNAMIC_SECRET_LEASE = "delete-dynamic-secret-lease",
  RENEW_DYNAMIC_SECRET_LEASE = "renew-dynamic-secret-lease",
  LIST_DYNAMIC_SECRET_LEASES = "list-dynamic-secret-leases",
  GET_DYNAMIC_SECRET_LEASE = "get-dynamic-secret-lease"
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
  authMethod?: string;
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

interface AcmeProfileActorMetadata {
  profileId: string;
}

interface AcmeAccountActorMetadata {
  profileId: string;
  accountId: string;
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

export interface AcmeProfileActor {
  type: ActorType.ACME_PROFILE;
  metadata: AcmeProfileActorMetadata;
}

export interface AcmeAccountActor {
  type: ActorType.ACME_ACCOUNT;
  metadata: AcmeAccountActorMetadata;
}

export type Actor =
  | UserActor
  | ServiceActor
  | IdentityActor
  | ScimClientActor
  | PlatformActor
  | KmipClientActor
  | AcmeProfileActor
  | AcmeAccountActor;

interface GetSecretsEvent {
  type: EventType.GET_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
  };
}

interface CreateSubOrganizationEvent {
  type: EventType.CREATE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    organizationId: string;
  };
}

interface UpdateSubOrganizationEvent {
  type: EventType.UPDATE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    organizationId: string;
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
    secretTags?: string[];
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
      secretTags?: string[];
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
    secretTags?: string[];
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
      secretTags?: string[];
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

interface GetProjectKeyEvent {
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
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
  };
}

interface UpdateIdentityEvent {
  type: EventType.UPDATE_IDENTITY;
  metadata: {
    identityId: string;
    name?: string;
    hasDeleteProtection?: boolean;
    metadata?: { key: string; value: string }[];
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

interface MachineIdentityAuthTemplateCreateEvent {
  type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_CREATE;
  metadata: {
    templateId: string;
    name: string;
  };
}

interface MachineIdentityAuthTemplateUpdateEvent {
  type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_UPDATE;
  metadata: {
    templateId: string;
    name: string;
  };
}

interface MachineIdentityAuthTemplateDeleteEvent {
  type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_DELETE;
  metadata: {
    templateId: string;
    name: string;
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
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDurationSeconds: number;
    lockoutCounterResetSeconds: number;
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
    lockoutEnabled?: boolean;
    lockoutThreshold?: number;
    lockoutDurationSeconds?: number;
    lockoutCounterResetSeconds?: number;
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

interface GetTokenIdentityTokenAuthEvent {
  type: EventType.GET_TOKEN_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    identityName: string;
    tokenId: string;
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

interface ClearIdentityUniversalAuthLockoutsEvent {
  type: EventType.CLEAR_IDENTITY_UNIVERSAL_AUTH_LOCKOUTS;
  metadata: {
    identityId: string;
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

interface LoginIdentityAliCloudAuthEvent {
  type: EventType.LOGIN_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
    identityAliCloudAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityAliCloudAuthEvent {
  type: EventType.ADD_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
    allowedArns: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityAliCloudAuthEvent {
  type: EventType.REVOKE_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityAliCloudAuthEvent {
  type: EventType.UPDATE_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
    allowedArns: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityAliCloudAuthEvent {
  type: EventType.GET_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityTlsCertAuthEvent {
  type: EventType.LOGIN_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    identityTlsCertAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityTlsCertAuthEvent {
  type: EventType.ADD_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    allowedCommonNames: string | null | undefined;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityTlsCertAuthEvent {
  type: EventType.REVOKE_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityTlsCertAuthEvent {
  type: EventType.UPDATE_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    allowedCommonNames: string | null | undefined;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityTlsCertAuthEvent {
  type: EventType.GET_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
  };
}

interface LoginIdentityOciAuthEvent {
  type: EventType.LOGIN_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
    identityOciAuthId: string;
    identityAccessTokenId: string;
  };
}

interface AddIdentityOciAuthEvent {
  type: EventType.ADD_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
    tenancyOcid: string;
    allowedUsernames: string | null;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentityOciAuthEvent {
  type: EventType.REVOKE_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
  };
}

interface UpdateIdentityOciAuthEvent {
  type: EventType.UPDATE_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
    tenancyOcid?: string;
    allowedUsernames: string | null;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface GetIdentityOciAuthEvent {
  type: EventType.GET_IDENTITY_OCI_AUTH;
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
    templateId?: string | null;
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDurationSeconds: number;
    lockoutCounterResetSeconds: number;
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
    templateId?: string | null;
    lockoutEnabled?: boolean;
    lockoutThreshold?: number;
    lockoutDurationSeconds?: number;
    lockoutCounterResetSeconds?: number;
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

interface ClearIdentityLdapAuthLockoutsEvent {
  type: EventType.CLEAR_IDENTITY_LDAP_AUTH_LOCKOUTS;
  metadata: {
    identityId: string;
  };
}

interface CreateIdentityOrgMembershipEvent {
  type: EventType.CREATE_IDENTITY_ORG_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles: unknown;
  };
}

interface UpdateIdentityOrgMembershipEvent {
  type: EventType.UPDATE_IDENTITY_ORG_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles?: unknown;
  };
}

interface DeleteIdentityOrgMembershipEvent {
  type: EventType.DELETE_IDENTITY_ORG_MEMBERSHIP;
  metadata: {
    identityId: string;
  };
}

interface CreateIdentityProjectMembershipEvent {
  type: EventType.CREATE_IDENTITY_PROJECT_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles: unknown;
  };
}

interface UpdateIdentityProjectMembershipEvent {
  type: EventType.UPDATE_IDENTITY_PROJECT_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles?: unknown;
  };
}

interface DeleteIdentityProjectMembershipEvent {
  type: EventType.DELETE_IDENTITY_PROJECT_MEMBERSHIP;
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

interface AddProjectMemberEvent {
  type: EventType.ADD_PROJECT_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface AddBatchProjectMemberEvent {
  type: EventType.ADD_BATCH_PROJECT_MEMBER;
  metadata: Array<{
    userId: string;
    email: string;
  }>;
}

interface RemoveProjectMemberEvent {
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
    description?: string;
  };
}

interface UpdateFolderEvent {
  type: EventType.UPDATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    oldFolderName?: string;
    newFolderName: string;
    newFolderDescription?: string;
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
  } & TWebhookPayloads;
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
    committedBy?: string | null;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
    eventType: SecretApprovalEvent;
    secretKey?: string;
    secretId?: string;
    secrets?: {
      secretKey?: string;
      secretId?: string;
      environment?: string;
      secretPath?: string;
    }[];
    environment: string;
    secretPath: string;
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
    name: string;
    dn?: string;
  };
}

interface GetCa {
  type: EventType.GET_CA;
  metadata: {
    caId: string;
    name: string;
    dn?: string;
  };
}

interface GetCAs {
  type: EventType.GET_CAS;
  metadata: {
    caIds: string[];
  };
}

interface UpdateCa {
  type: EventType.UPDATE_CA;
  metadata: {
    caId: string;
    name: string;
    dn?: string;
    status: CaStatus;
  };
}

interface DeleteCa {
  type: EventType.DELETE_CA;
  metadata: {
    caId: string;
    name: string;
    dn?: string;
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

interface ImportCert {
  type: EventType.IMPORT_CERT;
  metadata: {
    certId: string;
    cn: string;
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
interface GetCertPkcs12 {
  type: EventType.EXPORT_CERT_PKCS12;
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
    pkiCollectionId?: string;
    name: string;
    alertBefore: string;
    eventType: PkiAlertEventType;
    recipientEmails?: string;
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
    alertBefore?: string;
    eventType?: PkiAlertEventType;
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

interface CreatePkiSubscriber {
  type: EventType.CREATE_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    caId?: string;
    name: string;
    commonName: string;
    ttl?: string;
    subjectAlternativeNames: string[];
    keyUsages: CertKeyUsage[];
    extendedKeyUsages: CertExtendedKeyUsage[];
  };
}

interface UpdatePkiSubscriber {
  type: EventType.UPDATE_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    caId?: string;
    name?: string;
    commonName?: string;
    ttl?: string;
    subjectAlternativeNames?: string[];
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
  };
}

interface DeletePkiSubscriber {
  type: EventType.DELETE_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    name: string;
  };
}

interface GetPkiSubscriber {
  type: EventType.GET_PKI_SUBSCRIBER;
  metadata: {
    pkiSubscriberId: string;
    name: string;
  };
}

interface IssuePkiSubscriberCert {
  type: EventType.ISSUE_PKI_SUBSCRIBER_CERT;
  metadata: {
    subscriberId: string;
    name: string;
    serialNumber?: string;
  };
}

interface AutomatedRenewPkiSubscriberCert {
  type: EventType.AUTOMATED_RENEW_SUBSCRIBER_CERT;
  metadata: {
    subscriberId: string;
    name: string;
  };
}

interface AutomatedRenewCertificate {
  type: EventType.AUTOMATED_RENEW_CERTIFICATE;
  metadata: {
    certificateId: string;
    commonName: string;
    profileId: string;
    renewBeforeDays: string;
    profileName: string;
  };
}

interface AutomatedRenewCertificateFailed {
  type: EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED;
  metadata: {
    certificateId: string;
    commonName: string;
    profileId: string;
    renewBeforeDays: string;
    profileName: string;
    error: string;
  };
}

interface SignPkiSubscriberCert {
  type: EventType.SIGN_PKI_SUBSCRIBER_CERT;
  metadata: {
    subscriberId: string;
    name: string;
    serialNumber: string;
  };
}

interface ListPkiSubscriberCerts {
  type: EventType.LIST_PKI_SUBSCRIBER_CERTS;
  metadata: {
    subscriberId: string;
    name: string;
    projectId: string;
  };
}

interface GetSubscriberActiveCertBundle {
  type: EventType.GET_SUBSCRIBER_ACTIVE_CERT_BUNDLE;
  metadata: {
    subscriberId: string;
    name: string;
    certId: string;
    serialNumber: string;
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

interface UserLoginEvent {
  type: EventType.USER_LOGIN;
  metadata: {
    organizationId?: string;
    authProvider?: string;
  };
}

interface SelectOrganizationEvent {
  type: EventType.SELECT_ORGANIZATION;
  metadata: {
    organizationId: string;
    organizationName: string;
  };
}

interface SelectSubOrganizationEvent {
  type: EventType.SELECT_SUB_ORGANIZATION;
  metadata: {
    organizationId: string;
    organizationName: string;
    rootOrganizationId: string;
  };
}

interface CreateCertificateTemplateEstConfig {
  type: EventType.CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG;
  metadata: {
    certificateTemplateId: string;
    isEnabled: boolean;
  };
}

interface GetAzureAdCsTemplatesEvent {
  type: EventType.GET_AZURE_AD_TEMPLATES;
  metadata: {
    caId: string;
    amount: number;
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

interface CreateCertificatePolicy {
  type: EventType.CREATE_CERTIFICATE_POLICY;
  metadata:
    | {
        certificatePolicyId: string;
        name: string;
        projectId: string;
      }
    | {
        certificatePolicyId: string;
        caId: string;
        pkiCollectionId: string;
        name: string;
        commonName: string;
        subjectAlternativeName: string;
        ttl: string;
        projectId: string;
      };
}

interface UpdateCertificatePolicy {
  type: EventType.UPDATE_CERTIFICATE_POLICY;
  metadata:
    | {
        certificatePolicyId: string;
        name: string;
      }
    | {
        certificatePolicyId: string;
        caId: string;
        pkiCollectionId: string;
        name: string;
        commonName: string;
        subjectAlternativeName: string;
        ttl: string;
        projectId: string;
      };
}

interface DeleteCertificatePolicy {
  type: EventType.DELETE_CERTIFICATE_POLICY;
  metadata: {
    certificatePolicyId: string;
    name: string;
  };
}

interface GetCertificatePolicy {
  type: EventType.GET_CERTIFICATE_POLICY;
  metadata: {
    certificatePolicyId: string;
    name: string;
  };
}

interface ListCertificatePolicies {
  type: EventType.LIST_CERTIFICATE_POLICIES;
  metadata: {
    projectId: string;
  };
}

interface CreateCertificateProfile {
  type: EventType.CREATE_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
    projectId: string;
    enrollmentType: string;
    issuerType: string;
  };
}

interface UpdateCertificateProfile {
  type: EventType.UPDATE_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
  };
}

interface DeleteCertificateProfile {
  type: EventType.DELETE_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
  };
}

interface GetCertificateProfile {
  type: EventType.GET_CERTIFICATE_PROFILE;
  metadata: {
    certificateProfileId: string;
    name: string;
  };
}

interface ListCertificateProfiles {
  type: EventType.LIST_CERTIFICATE_PROFILES;
  metadata: {
    projectId: string;
  };
}

interface IssueCertificateFromProfile {
  type: EventType.ISSUE_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    commonName: string;
    profileName: string;
  };
}

interface SignCertificateFromProfile {
  type: EventType.SIGN_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    profileName: string;
    commonName: string;
  };
}

interface OrderCertificateFromProfile {
  type: EventType.ORDER_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    profileName: string;
  };
}

interface GetCertificateProfileLatestActiveBundle {
  type: EventType.GET_CERTIFICATE_PROFILE_LATEST_ACTIVE_BUNDLE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    commonName: string;
    profileName: string;
    serialNumber: string;
  };
}

interface RenewCertificate {
  type: EventType.RENEW_CERTIFICATE;
  metadata: {
    originalCertificateId: string;
    newCertificateId: string;
    profileName: string;
    commonName: string;
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
    keyName: string;
  };
}

interface CmekGetPrivateKeyEvent {
  type: EventType.CMEK_GET_PRIVATE_KEY;
  metadata: {
    keyId: string;
    keyName: string;
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

interface GetAppConnectionUsageEvent {
  type: EventType.GET_APP_CONNECTION_USAGE;
  metadata: {
    connectionId: string;
  };
}

interface MigrateAppConnectionEvent {
  type: EventType.MIGRATE_APP_CONNECTION;
  metadata: {
    connectionId: string;
  };
}

interface CreateAppConnectionEvent {
  type: EventType.CREATE_APP_CONNECTION;
  metadata: Omit<TCreateAppConnectionDTO, "credentials" | "projectId"> & { connectionId: string };
}

interface UpdateAppConnectionEvent {
  type: EventType.UPDATE_APP_CONNECTION;
  metadata: Omit<TUpdateAppConnectionDTO, "credentials" | "projectId"> & {
    connectionId: string;
    credentialsUpdated: boolean;
  };
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

interface GetPkiSyncsEvent {
  type: EventType.GET_PKI_SYNCS;
  metadata: {
    projectId: string;
  };
}

interface GetPkiSyncEvent {
  type: EventType.GET_PKI_SYNC;
  metadata: {
    destination: string;
    syncId: string;
  };
}

interface GetPkiSyncCertificatesEvent {
  type: EventType.GET_PKI_SYNC_CERTIFICATES;
  metadata: {
    syncId: string;
    count: number;
    certificateIds: string[];
    destination: string;
  };
}

interface CreatePkiSyncEvent {
  type: EventType.CREATE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    destination: string;
  };
}

interface UpdatePkiSyncEvent {
  type: EventType.UPDATE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
  };
}

interface DeletePkiSyncEvent {
  type: EventType.DELETE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    destination: string;
  };
}

interface PkiSyncSyncCertificatesEvent {
  type: EventType.PKI_SYNC_SYNC_CERTIFICATES;
  metadata: {
    syncId: string;
    syncMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

interface PkiSyncImportCertificatesEvent {
  type: EventType.PKI_SYNC_IMPORT_CERTIFICATES;
  metadata: {
    syncId: string;
    importMessage: string | null;
    jobId: string;
    jobRanAt: Date;
  };
}

interface PkiSyncRemoveCertificatesEvent {
  type: EventType.PKI_SYNC_REMOVE_CERTIFICATES;
  metadata: {
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

interface ReconcileSecretRotationEvent {
  type: EventType.RECONCILE_SECRET_ROTATION;
  metadata: {
    type: string;
    rotationId: string;
    reconciled: boolean;
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

interface GetProjectPitCommitsEvent {
  type: EventType.GET_PROJECT_PIT_COMMITS;
  metadata: {
    commitCount: string;
    environment: string;
    path: string;
    offset: string;
    limit: string;
    search?: string;
    sort: string;
  };
}

interface GetProjectPitCommitChangesEvent {
  type: EventType.GET_PROJECT_PIT_COMMIT_CHANGES;
  metadata: {
    changesCount: string;
    commitId: string;
  };
}

interface GetProjectPitCommitCountEvent {
  type: EventType.GET_PROJECT_PIT_COMMIT_COUNT;
  metadata: {
    environment: string;
    path: string;
    commitCount: string;
  };
}

interface PitRollbackCommitEvent {
  type: EventType.PIT_ROLLBACK_COMMIT;
  metadata: {
    targetCommitId: string;
    folderId: string;
    deepRollback: boolean;
    message: string;
    totalChanges: string;
    environment: string;
  };
}

interface PitRevertCommitEvent {
  type: EventType.PIT_REVERT_COMMIT;
  metadata: {
    commitId: string;
    revertCommitId?: string;
    changesReverted?: string;
  };
}

interface PitGetFolderStateEvent {
  type: EventType.PIT_GET_FOLDER_STATE;
  metadata: {
    commitId: string;
    folderId: string;
    resourceCount: string;
  };
}

interface PitCompareFolderStatesEvent {
  type: EventType.PIT_COMPARE_FOLDER_STATES;
  metadata: {
    targetCommitId: string;
    folderId: string;
    deepRollback: boolean;
    diffsCount: string;
    environment: string;
    folderPath: string;
  };
}

interface PitProcessNewCommitRawEvent {
  type: EventType.PIT_PROCESS_NEW_COMMIT_RAW;
  metadata: {
    projectId: string;
    environment: string;
    secretPath: string;
    message: string;
    approvalId?: string;
    commitId?: string;
  };
}

interface SecretScanningDataSourceListEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_LIST;
  metadata: {
    type?: SecretScanningDataSource;
    count: number;
    dataSourceIds: string[];
  };
}

interface SecretScanningDataSourceGetEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_GET;
  metadata: {
    type: SecretScanningDataSource;
    dataSourceId: string;
  };
}

interface SecretScanningDataSourceCreateEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_CREATE;
  metadata: Omit<TCreateSecretScanningDataSourceDTO, "projectId"> & { dataSourceId: string };
}

interface SecretScanningDataSourceUpdateEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_UPDATE;
  metadata: TUpdateSecretScanningDataSourceDTO;
}

interface SecretScanningDataSourceDeleteEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_DELETE;
  metadata: TDeleteSecretScanningDataSourceDTO;
}

interface SecretScanningDataSourceTriggerScanEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_TRIGGER_SCAN;
  metadata: TTriggerSecretScanningDataSourceDTO;
}

interface SecretScanningDataSourceScanEvent {
  type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN;
  metadata: {
    scanId: string;
    resourceId: string;
    resourceType: string;
    dataSourceId: string;
    dataSourceType: string;
    scanStatus: SecretScanningScanStatus;
    scanType: SecretScanningScanType;
    numberOfSecretsDetected?: number;
  };
}

interface SecretScanningResourceListEvent {
  type: EventType.SECRET_SCANNING_RESOURCE_LIST;
  metadata: {
    type: SecretScanningDataSource;
    dataSourceId: string;
    resourceIds: string[];
    count: number;
  };
}

interface SecretScanningScanListEvent {
  type: EventType.SECRET_SCANNING_SCAN_LIST;
  metadata: {
    type: SecretScanningDataSource;
    dataSourceId: string;
    count: number;
  };
}

interface SecretScanningFindingListEvent {
  type: EventType.SECRET_SCANNING_FINDING_LIST;
  metadata: {
    findingIds: string[];
    count: number;
  };
}

interface SecretScanningFindingUpdateEvent {
  type: EventType.SECRET_SCANNING_FINDING_UPDATE;
  metadata: TUpdateSecretScanningFindingDTO;
}

interface SecretScanningConfigUpdateEvent {
  type: EventType.SECRET_SCANNING_CONFIG_UPDATE;
  metadata: {
    content: string | null;
  };
}

interface SecretReminderCreateEvent {
  type: EventType.CREATE_SECRET_REMINDER;
  metadata: {
    secretId: string;
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
  };
}

interface SecretReminderGetEvent {
  type: EventType.GET_SECRET_REMINDER;
  metadata: {
    secretId: string;
  };
}

interface SecretReminderDeleteEvent {
  type: EventType.DELETE_SECRET_REMINDER;
  metadata: {
    secretId: string;
  };
}

interface SecretScanningConfigReadEvent {
  type: EventType.SECRET_SCANNING_CONFIG_GET;
  metadata?: Record<string, never>; // not needed, based off projectId
}

interface OrgUpdateEvent {
  type: EventType.UPDATE_ORG;
  metadata: {
    name?: string;
    slug?: string;
    authEnforced?: boolean;
    scimEnabled?: boolean;
    defaultMembershipRoleSlug?: string;
    enforceMfa?: boolean;
    selectedMfaMethod?: string;
    allowSecretSharingOutsideOrganization?: boolean;
    bypassOrgAuthEnabled?: boolean;
    userTokenExpiration?: string;
    secretsProductEnabled?: boolean;
    pkiProductEnabled?: boolean;
    kmsProductEnabled?: boolean;
    sshProductEnabled?: boolean;
    scannerProductEnabled?: boolean;
    shareSecretsProductEnabled?: boolean;
  };
}

interface ProjectCreateEvent {
  type: EventType.CREATE_PROJECT;
  metadata: {
    name: string;
    slug?: string;
    type: ProjectType;
  };
}

interface ProjectUpdateEvent {
  type: EventType.UPDATE_PROJECT;
  metadata: {
    name?: string;
    description?: string;
    autoCapitalization?: boolean;
    hasDeleteProtection?: boolean;
    slug?: string;
    secretSharing?: boolean;
    pitVersionLimit?: number;
    auditLogsRetentionDays?: number;
  };
}

interface ProjectDeleteEvent {
  type: EventType.DELETE_PROJECT;
  metadata: {
    id: string;
    name: string;
  };
}

interface DashboardListSecretsEvent {
  type: EventType.DASHBOARD_LIST_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    numberOfSecrets: number;
    secretIds: string[];
  };
}

interface DashboardGetSecretValueEvent {
  type: EventType.DASHBOARD_GET_SECRET_VALUE;
  metadata: {
    secretId: string;
    secretKey: string;
    environment: string;
    secretPath: string;
  };
}

interface DashboardGetSecretVersionValueEvent {
  type: EventType.DASHBOARD_GET_SECRET_VERSION_VALUE;
  metadata: {
    secretId: string;
    version: string;
  };
}

interface ProjectRoleCreateEvent {
  type: EventType.CREATE_PROJECT_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
    description?: string | null;
    permissions: string;
  };
}

interface ProjectRoleUpdateEvent {
  type: EventType.UPDATE_PROJECT_ROLE;
  metadata: {
    roleId: string;
    slug?: string;
    name?: string;
    description?: string | null;
    permissions?: string;
  };
}

interface ProjectRoleDeleteEvent {
  type: EventType.DELETE_PROJECT_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
  };
}

interface OrgRoleCreateEvent {
  type: EventType.CREATE_ORG_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
    description?: string | null;
    permissions: string;
  };
}

interface OrgRoleUpdateEvent {
  type: EventType.UPDATE_ORG_ROLE;
  metadata: {
    roleId: string;
    slug?: string;
    name?: string;
    description?: string | null;
    permissions?: string;
  };
}

interface OrgRoleDeleteEvent {
  type: EventType.DELETE_ORG_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
  };
}

interface PamSessionCredentialsGetEvent {
  type: EventType.PAM_SESSION_CREDENTIALS_GET;
  metadata: {
    sessionId: string;
    accountName: string;
  };
}

interface PamSessionStartEvent {
  type: EventType.PAM_SESSION_START;
  metadata: {
    sessionId: string;
    accountName: string;
  };
}

interface PamSessionLogsUpdateEvent {
  type: EventType.PAM_SESSION_LOGS_UPDATE;
  metadata: {
    sessionId: string;
    accountName: string;
  };
}

interface PamSessionEndEvent {
  type: EventType.PAM_SESSION_END;
  metadata: {
    sessionId: string;
    accountName: string;
  };
}

interface PamSessionGetEvent {
  type: EventType.PAM_SESSION_GET;
  metadata: {
    sessionId: string;
  };
}

interface PamSessionListEvent {
  type: EventType.PAM_SESSION_LIST;
  metadata: {
    count: number;
  };
}

interface PamFolderCreateEvent {
  type: EventType.PAM_FOLDER_CREATE;
  metadata: {
    parentId?: string | null;
    name: string;
    description?: string | null;
  };
}

interface PamFolderUpdateEvent {
  type: EventType.PAM_FOLDER_UPDATE;
  metadata: {
    folderId: string;
    name?: string;
    description?: string | null;
  };
}

interface PamFolderDeleteEvent {
  type: EventType.PAM_FOLDER_DELETE;
  metadata: {
    folderId: string;
    folderName: string;
  };
}

interface PamAccountListEvent {
  type: EventType.PAM_ACCOUNT_LIST;
  metadata: {
    accountCount: number;
    folderCount: number;
  };
}

interface PamAccountAccessEvent {
  type: EventType.PAM_ACCOUNT_ACCESS;
  metadata: {
    accountId: string;
    accountPath: string;
    accountName: string;
    duration?: string;
  };
}

interface PamAccountCreateEvent {
  type: EventType.PAM_ACCOUNT_CREATE;
  metadata: {
    resourceId: string;
    resourceType: string;
    folderId?: string | null;
    name: string;
    description?: string | null;
    rotationEnabled: boolean;
    rotationIntervalSeconds?: number | null;
    requireMfa?: boolean | null;
  };
}

interface PamAccountUpdateEvent {
  type: EventType.PAM_ACCOUNT_UPDATE;
  metadata: {
    accountId: string;
    resourceId: string;
    resourceType: string;
    name?: string;
    description?: string | null;
    rotationEnabled?: boolean;
    rotationIntervalSeconds?: number | null;
    requireMfa?: boolean | null;
  };
}

interface PamAccountDeleteEvent {
  type: EventType.PAM_ACCOUNT_DELETE;
  metadata: {
    accountName: string;
    accountId: string;
    resourceId: string;
    resourceType: string;
  };
}

interface PamAccountCredentialRotationEvent {
  type: EventType.PAM_ACCOUNT_CREDENTIAL_ROTATION;
  metadata: {
    accountName: string;
    accountId: string;
    resourceId: string;
    resourceType: string;
  };
}

interface PamAccountCredentialRotationFailedEvent {
  type: EventType.PAM_ACCOUNT_CREDENTIAL_ROTATION_FAILED;
  metadata: {
    accountName: string;
    accountId: string;
    resourceId: string;
    resourceType: string;
    errorMessage: string;
  };
}

interface PamResourceListEvent {
  type: EventType.PAM_RESOURCE_LIST;
  metadata: {
    count: number;
  };
}

interface PamResourceGetEvent {
  type: EventType.PAM_RESOURCE_GET;
  metadata: {
    resourceId: string;
    resourceType: string;
    name: string;
  };
}

interface PamResourceCreateEvent {
  type: EventType.PAM_RESOURCE_CREATE;
  metadata: {
    resourceType: string;
    gatewayId?: string;
    name: string;
  };
}

interface PamResourceUpdateEvent {
  type: EventType.PAM_RESOURCE_UPDATE;
  metadata: {
    resourceId: string;
    resourceType: string;
    gatewayId?: string;
    name?: string;
  };
}

interface PamResourceDeleteEvent {
  type: EventType.PAM_RESOURCE_DELETE;
  metadata: {
    resourceId: string;
    resourceType: string;
  };
}

interface UpdateCertificateRenewalConfigEvent {
  type: EventType.UPDATE_CERTIFICATE_RENEWAL_CONFIG;
  metadata: {
    certificateId: string;
    renewBeforeDays: string;
    commonName: string;
  };
}

interface DisableCertificateRenewalConfigEvent {
  type: EventType.DISABLE_CERTIFICATE_RENEWAL_CONFIG;
  metadata: {
    certificateId: string;
    commonName: string;
  };
}

interface CreateCertificateRequestEvent {
  type: EventType.CREATE_CERTIFICATE_REQUEST;
  metadata: {
    certificateRequestId: string;
    profileId?: string;
    caId?: string;
    commonName?: string;
  };
}

interface GetCertificateRequestEvent {
  type: EventType.GET_CERTIFICATE_REQUEST;
  metadata: {
    certificateRequestId: string;
  };
}

interface GetCertificateFromRequestEvent {
  type: EventType.GET_CERTIFICATE_FROM_REQUEST;
  metadata: {
    certificateRequestId: string;
    certificateId?: string;
  };
}

interface ListCertificateRequestsEvent {
  type: EventType.LIST_CERTIFICATE_REQUESTS;
  metadata: {
    offset: number;
    limit: number;
    search?: string;
    status?: string;
    count: number;
    certificateRequestIds: string[];
  };
}

interface ApprovalPolicyCreateEvent {
  type: EventType.APPROVAL_POLICY_CREATE;
  metadata: {
    policyType: string;
    name: string;
  };
}

interface ApprovalPolicyUpdateEvent {
  type: EventType.APPROVAL_POLICY_UPDATE;
  metadata: {
    policyType: string;
    policyId: string;
    name: string;
  };
}

interface ApprovalPolicyDeleteEvent {
  type: EventType.APPROVAL_POLICY_DELETE;
  metadata: {
    policyType: string;
    policyId: string;
  };
}

interface ApprovalPolicyListEvent {
  type: EventType.APPROVAL_POLICY_LIST;
  metadata: {
    policyType: string;
    count: number;
  };
}

interface ApprovalPolicyGetEvent {
  type: EventType.APPROVAL_POLICY_GET;
  metadata: {
    policyType: string;
    policyId: string;
    name: string;
  };
}

interface ApprovalRequestGetEvent {
  type: EventType.APPROVAL_REQUEST_GET;
  metadata: {
    policyType: string;
    requestId: string;
    status: string;
  };
}

interface ApprovalRequestListEvent {
  type: EventType.APPROVAL_REQUEST_LIST;
  metadata: {
    policyType: string;
    count: number;
  };
}

interface ApprovalRequestCreateEvent {
  type: EventType.APPROVAL_REQUEST_CREATE;
  metadata: {
    policyType: string;
    justification?: string;
    requestDuration: string;
  };
}

interface ApprovalRequestApproveEvent {
  type: EventType.APPROVAL_REQUEST_APPROVE;
  metadata: {
    policyType: string;
    requestId: string;
    comment?: string;
  };
}

interface ApprovalRequestRejectEvent {
  type: EventType.APPROVAL_REQUEST_REJECT;
  metadata: {
    policyType: string;
    requestId: string;
    comment?: string;
  };
}

interface ApprovalRequestCancelEvent {
  type: EventType.APPROVAL_REQUEST_CANCEL;
  metadata: {
    policyType: string;
    requestId: string;
  };
}

interface ApprovalRequestGrantListEvent {
  type: EventType.APPROVAL_REQUEST_GRANT_LIST;
  metadata: {
    policyType: string;
    count: number;
  };
}

interface ApprovalRequestGrantGetEvent {
  type: EventType.APPROVAL_REQUEST_GRANT_GET;
  metadata: {
    policyType: string;
    grantId: string;
    status: string;
  };
}

interface ApprovalRequestGrantRevokeEvent {
  type: EventType.APPROVAL_REQUEST_GRANT_REVOKE;
  metadata: {
    policyType: string;
    grantId: string;
    revocationReason?: string;
  };
}

interface CreateAcmeAccountEvent {
  type: EventType.CREATE_ACME_ACCOUNT;
  metadata: {
    accountId: string;
    publicKeyThumbprint: string;
    emails?: string[];
  };
}

interface RetrieveAcmeAccountEvent {
  type: EventType.RETRIEVE_ACME_ACCOUNT;
  metadata: {
    accountId: string;
    publicKeyThumbprint: string;
  };
}

interface CreateAcmeOrderEvent {
  type: EventType.CREATE_ACME_ORDER;
  metadata: {
    orderId: string;
    identifiers: Array<{
      type: AcmeIdentifierType;
      value: string;
    }>;
  };
}

interface FinalizeAcmeOrderEvent {
  type: EventType.FINALIZE_ACME_ORDER;
  metadata: {
    orderId: string;
    csr: string;
  };
}

interface DownloadAcmeCertificateEvent {
  type: EventType.DOWNLOAD_ACME_CERTIFICATE;
  metadata: {
    orderId: string;
  };
}

interface RespondToAcmeChallengeEvent {
  type: EventType.RESPOND_TO_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: AcmeChallengeType;
  };
}
interface PassedAcmeChallengeEvent {
  type: EventType.PASS_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: AcmeChallengeType;
  };
}

interface AttemptAcmeChallengeEvent {
  type: EventType.ATTEMPT_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: AcmeChallengeType;
    retryCount: number;
    errorMessage: string;
  };
}

interface FailAcmeChallengeEvent {
  type: EventType.FAIL_ACME_CHALLENGE;
  metadata: {
    challengeId: string;
    type: AcmeChallengeType;
    retryCount: number;
    errorMessage: string;
  };
}

interface McpEndpointCreateEvent {
  type: EventType.MCP_ENDPOINT_CREATE;
  metadata: {
    endpointId: string;
    name: string;
    description?: string;
    serverIds: string[];
  };
}

interface McpEndpointUpdateEvent {
  type: EventType.MCP_ENDPOINT_UPDATE;
  metadata: {
    endpointId: string;
    name?: string;
    description?: string;
    serverIds?: string[];
    piiRequestFiltering?: boolean;
    piiResponseFiltering?: boolean;
    piiEntityTypes?: string;
  };
}

interface McpEndpointDeleteEvent {
  type: EventType.MCP_ENDPOINT_DELETE;
  metadata: {
    endpointId: string;
    name: string;
  };
}

interface McpEndpointGetEvent {
  type: EventType.MCP_ENDPOINT_GET;
  metadata: {
    endpointId: string;
    name: string;
  };
}

interface McpEndpointListEvent {
  type: EventType.MCP_ENDPOINT_LIST;
  metadata: {
    count: number;
  };
}

interface McpEndpointListToolsEvent {
  type: EventType.MCP_ENDPOINT_LIST_TOOLS;
  metadata: {
    endpointId: string;
    endpointName: string;
    toolCount: number;
  };
}

interface McpEndpointEnableToolEvent {
  type: EventType.MCP_ENDPOINT_ENABLE_TOOL;
  metadata: {
    endpointId: string;
    endpointName: string;
    serverToolId: string;
    toolName: string;
  };
}

interface McpEndpointDisableToolEvent {
  type: EventType.MCP_ENDPOINT_DISABLE_TOOL;
  metadata: {
    endpointId: string;
    endpointName: string;
    serverToolId: string;
    toolName: string;
  };
}

interface McpEndpointBulkUpdateToolsEvent {
  type: EventType.MCP_ENDPOINT_BULK_UPDATE_TOOLS;
  metadata: {
    endpointId: string;
    endpointName: string;
    toolsUpdated: number;
  };
}

interface McpEndpointOAuthClientRegisterEvent {
  type: EventType.MCP_ENDPOINT_OAUTH_CLIENT_REGISTER;
  metadata: {
    endpointId: string;
    endpointName: string;
    clientId: string;
    clientName: string;
  };
}

interface McpEndpointOAuthAuthorizeEvent {
  type: EventType.MCP_ENDPOINT_OAUTH_AUTHORIZE;
  metadata: {
    endpointId: string;
    endpointName: string;
    clientId: string;
  };
}

interface McpEndpointConnectEvent {
  type: EventType.MCP_ENDPOINT_CONNECT;
  metadata: {
    endpointId: string;
    endpointName: string;
    userId: string;
  };
}

interface McpEndpointSaveUserCredentialEvent {
  type: EventType.MCP_ENDPOINT_SAVE_USER_CREDENTIAL;
  metadata: {
    endpointId: string;
    endpointName: string;
    serverId: string;
    serverName: string;
  };
}

interface McpServerCreateEvent {
  type: EventType.MCP_SERVER_CREATE;
  metadata: {
    serverId: string;
    name: string;
    url: string;
    credentialMode: string;
    authMethod: string;
  };
}

interface McpServerUpdateEvent {
  type: EventType.MCP_SERVER_UPDATE;
  metadata: {
    serverId: string;
    name: string;
  };
}

interface McpServerDeleteEvent {
  type: EventType.MCP_SERVER_DELETE;
  metadata: {
    serverId: string;
    name: string;
  };
}

interface McpServerGetEvent {
  type: EventType.MCP_SERVER_GET;
  metadata: {
    serverId: string;
    name: string;
  };
}

interface McpServerListEvent {
  type: EventType.MCP_SERVER_LIST;
  metadata: {
    count: number;
  };
}

interface McpServerListToolsEvent {
  type: EventType.MCP_SERVER_LIST_TOOLS;
  metadata: {
    serverId: string;
    serverName: string;
    toolCount: number;
  };
}

interface McpServerSyncToolsEvent {
  type: EventType.MCP_SERVER_SYNC_TOOLS;
  metadata: {
    serverId: string;
    serverName: string;
    toolCount: number;
  };
}

interface McpActivityLogListEvent {
  type: EventType.MCP_ACTIVITY_LOG_LIST;
  metadata: {
    count: number;
  };
}

interface GetDynamicSecretLeaseEvent {
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

interface RenewDynamicSecretLeaseEvent {
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

interface CreateDynamicSecretLeaseEvent {
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

interface DeleteDynamicSecretLeaseEvent {
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

interface CreateDynamicSecretEvent {
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

interface UpdateDynamicSecretEvent {
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

interface DeleteDynamicSecretEvent {
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

interface GetDynamicSecretEvent {
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

interface ListDynamicSecretsEvent {
  type: EventType.LIST_DYNAMIC_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    projectId: string;
  };
}

interface ListDynamicSecretLeasesEvent {
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

export type Event =
  | CreateSubOrganizationEvent
  | UpdateSubOrganizationEvent
  | GetSecretsEvent
  | GetSecretEvent
  | CreateSecretEvent
  | CreateSecretBatchEvent
  | UpdateSecretEvent
  | UpdateSecretBatchEvent
  | MoveSecretsEvent
  | DeleteSecretEvent
  | DeleteSecretBatchEvent
  | GetProjectKeyEvent
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
  | MachineIdentityAuthTemplateCreateEvent
  | MachineIdentityAuthTemplateUpdateEvent
  | MachineIdentityAuthTemplateDeleteEvent
  | AddIdentityUniversalAuthEvent
  | UpdateIdentityUniversalAuthEvent
  | DeleteIdentityUniversalAuthEvent
  | GetIdentityUniversalAuthEvent
  | CreateTokenIdentityTokenAuthEvent
  | UpdateTokenIdentityTokenAuthEvent
  | GetTokensIdentityTokenAuthEvent
  | GetTokenIdentityTokenAuthEvent
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
  | ClearIdentityUniversalAuthLockoutsEvent
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
  | LoginIdentityAliCloudAuthEvent
  | AddIdentityAliCloudAuthEvent
  | UpdateIdentityAliCloudAuthEvent
  | GetIdentityAliCloudAuthEvent
  | DeleteIdentityAliCloudAuthEvent
  | LoginIdentityTlsCertAuthEvent
  | AddIdentityTlsCertAuthEvent
  | UpdateIdentityTlsCertAuthEvent
  | GetIdentityTlsCertAuthEvent
  | DeleteIdentityTlsCertAuthEvent
  | LoginIdentityOciAuthEvent
  | AddIdentityOciAuthEvent
  | UpdateIdentityOciAuthEvent
  | GetIdentityOciAuthEvent
  | DeleteIdentityOciAuthEvent
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
  | ClearIdentityLdapAuthLockoutsEvent
  | CreateIdentityOrgMembershipEvent
  | UpdateIdentityOrgMembershipEvent
  | DeleteIdentityOrgMembershipEvent
  | CreateIdentityProjectMembershipEvent
  | UpdateIdentityProjectMembershipEvent
  | DeleteIdentityProjectMembershipEvent
  | CreateEnvironmentEvent
  | GetEnvironmentEvent
  | UpdateEnvironmentEvent
  | DeleteEnvironmentEvent
  | AddProjectMemberEvent
  | AddBatchProjectMemberEvent
  | RemoveProjectMemberEvent
  | CreateFolderEvent
  | UpdateFolderEvent
  | DeleteFolderEvent
  | CreateWebhookEvent
  | UpdateWebhookStatusEvent
  | DeleteWebhookEvent
  | WebhookTriggeredEvent
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
  | GetCAs
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
  | ImportCert
  | SignCert
  | GetCaCertificateTemplates
  | GetCert
  | DeleteCert
  | RevokeCert
  | GetCertBody
  | GetCertPrivateKey
  | GetCertBundle
  | GetCertPkcs12
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
  | CreatePkiSubscriber
  | UpdatePkiSubscriber
  | DeletePkiSubscriber
  | GetPkiSubscriber
  | IssuePkiSubscriberCert
  | SignPkiSubscriberCert
  | AutomatedRenewPkiSubscriberCert
  | ListPkiSubscriberCerts
  | GetSubscriberActiveCertBundle
  | CreateKmsEvent
  | UpdateKmsEvent
  | DeleteKmsEvent
  | GetKmsEvent
  | UpdateProjectKmsEvent
  | GetProjectKmsBackupEvent
  | LoadProjectKmsBackupEvent
  | OrgAdminAccessProjectEvent
  | OrgAdminBypassSSOEvent
  | CreateCertificateTemplateEstConfig
  | UpdateCertificateTemplateEstConfig
  | GetCertificateTemplateEstConfig
  | CreateCertificatePolicy
  | UpdateCertificatePolicy
  | DeleteCertificatePolicy
  | GetCertificatePolicy
  | ListCertificatePolicies
  | CreateCertificateProfile
  | UpdateCertificateProfile
  | DeleteCertificateProfile
  | GetCertificateProfile
  | ListCertificateProfiles
  | GetCertificateProfileLatestActiveBundle
  | IssueCertificateFromProfile
  | SignCertificateFromProfile
  | OrderCertificateFromProfile
  | RenewCertificate
  | GetAzureAdCsTemplatesEvent
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
  | CmekGetPrivateKeyEvent
  | GetExternalGroupOrgRoleMappingsEvent
  | UpdateExternalGroupOrgRoleMappingsEvent
  | GetProjectTemplatesEvent
  | GetProjectTemplateEvent
  | CreateProjectTemplateEvent
  | UpdateProjectTemplateEvent
  | DeleteProjectTemplateEvent
  | GetAppConnectionsEvent
  | GetAvailableAppConnectionsDetailsEvent
  | GetAppConnectionEvent
  | CreateAppConnectionEvent
  | UpdateAppConnectionEvent
  | DeleteAppConnectionEvent
  | GetAppConnectionUsageEvent
  | MigrateAppConnectionEvent
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
  | GetPkiSyncsEvent
  | GetPkiSyncEvent
  | GetPkiSyncCertificatesEvent
  | CreatePkiSyncEvent
  | UpdatePkiSyncEvent
  | DeletePkiSyncEvent
  | PkiSyncSyncCertificatesEvent
  | PkiSyncImportCertificatesEvent
  | PkiSyncRemoveCertificatesEvent
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
  | ReconcileSecretRotationEvent
  | MicrosoftTeamsWorkflowIntegrationCreateEvent
  | MicrosoftTeamsWorkflowIntegrationDeleteEvent
  | MicrosoftTeamsWorkflowIntegrationCheckInstallationStatusEvent
  | MicrosoftTeamsWorkflowIntegrationGetTeamsEvent
  | MicrosoftTeamsWorkflowIntegrationGetEvent
  | MicrosoftTeamsWorkflowIntegrationListEvent
  | MicrosoftTeamsWorkflowIntegrationUpdateEvent
  | GetProjectPitCommitsEvent
  | GetProjectPitCommitChangesEvent
  | PitRollbackCommitEvent
  | GetProjectPitCommitCountEvent
  | PitRevertCommitEvent
  | PitCompareFolderStatesEvent
  | PitGetFolderStateEvent
  | PitProcessNewCommitRawEvent
  | SecretScanningDataSourceListEvent
  | SecretScanningDataSourceGetEvent
  | SecretScanningDataSourceCreateEvent
  | SecretScanningDataSourceUpdateEvent
  | SecretScanningDataSourceDeleteEvent
  | SecretScanningDataSourceTriggerScanEvent
  | SecretScanningDataSourceScanEvent
  | SecretScanningResourceListEvent
  | SecretScanningScanListEvent
  | SecretScanningFindingListEvent
  | SecretScanningFindingUpdateEvent
  | SecretScanningConfigUpdateEvent
  | SecretScanningConfigReadEvent
  | OrgUpdateEvent
  | ProjectCreateEvent
  | ProjectUpdateEvent
  | ProjectDeleteEvent
  | SecretReminderCreateEvent
  | SecretReminderGetEvent
  | SecretReminderDeleteEvent
  | DashboardListSecretsEvent
  | DashboardGetSecretValueEvent
  | DashboardGetSecretVersionValueEvent
  | ProjectRoleCreateEvent
  | ProjectRoleUpdateEvent
  | ProjectRoleDeleteEvent
  | OrgRoleCreateEvent
  | OrgRoleUpdateEvent
  | OrgRoleDeleteEvent
  | PamSessionCredentialsGetEvent
  | PamSessionStartEvent
  | PamSessionLogsUpdateEvent
  | PamSessionEndEvent
  | PamSessionGetEvent
  | PamSessionListEvent
  | PamFolderCreateEvent
  | PamFolderUpdateEvent
  | PamFolderDeleteEvent
  | PamAccountListEvent
  | PamAccountAccessEvent
  | PamAccountCreateEvent
  | PamAccountUpdateEvent
  | PamAccountDeleteEvent
  | PamAccountCredentialRotationEvent
  | PamAccountCredentialRotationFailedEvent
  | PamResourceListEvent
  | PamResourceGetEvent
  | PamResourceCreateEvent
  | PamResourceUpdateEvent
  | PamResourceDeleteEvent
  | UpdateCertificateRenewalConfigEvent
  | DisableCertificateRenewalConfigEvent
  | CreateCertificateRequestEvent
  | GetCertificateRequestEvent
  | GetCertificateFromRequestEvent
  | ListCertificateRequestsEvent
  | AutomatedRenewCertificate
  | AutomatedRenewCertificateFailed
  | UserLoginEvent
  | SelectOrganizationEvent
  | SelectSubOrganizationEvent
  | ApprovalPolicyCreateEvent
  | ApprovalPolicyUpdateEvent
  | ApprovalPolicyDeleteEvent
  | ApprovalPolicyListEvent
  | ApprovalPolicyGetEvent
  | ApprovalRequestGetEvent
  | ApprovalRequestListEvent
  | ApprovalRequestCreateEvent
  | ApprovalRequestApproveEvent
  | ApprovalRequestRejectEvent
  | ApprovalRequestCancelEvent
  | ApprovalRequestGrantListEvent
  | ApprovalRequestGrantGetEvent
  | ApprovalRequestGrantRevokeEvent
  | CreateAcmeAccountEvent
  | RetrieveAcmeAccountEvent
  | CreateAcmeOrderEvent
  | FinalizeAcmeOrderEvent
  | DownloadAcmeCertificateEvent
  | RespondToAcmeChallengeEvent
  | PassedAcmeChallengeEvent
  | AttemptAcmeChallengeEvent
  | FailAcmeChallengeEvent
  | McpEndpointCreateEvent
  | McpEndpointUpdateEvent
  | McpEndpointDeleteEvent
  | McpEndpointGetEvent
  | McpEndpointListEvent
  | McpEndpointListToolsEvent
  | McpEndpointEnableToolEvent
  | McpEndpointDisableToolEvent
  | McpEndpointBulkUpdateToolsEvent
  | McpEndpointOAuthClientRegisterEvent
  | McpEndpointOAuthAuthorizeEvent
  | McpEndpointConnectEvent
  | McpEndpointSaveUserCredentialEvent
  | McpServerCreateEvent
  | McpServerUpdateEvent
  | McpServerDeleteEvent
  | McpServerGetEvent
  | McpServerListEvent
  | McpServerListToolsEvent
  | McpServerSyncToolsEvent
  | McpActivityLogListEvent
  | CreateDynamicSecretEvent
  | UpdateDynamicSecretEvent
  | DeleteDynamicSecretEvent
  | GetDynamicSecretEvent
  | ListDynamicSecretsEvent
  | ListDynamicSecretLeasesEvent
  | CreateDynamicSecretLeaseEvent
  | DeleteDynamicSecretLeaseEvent
  | RenewDynamicSecretLeaseEvent
  | GetDynamicSecretLeaseEvent;
