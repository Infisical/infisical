import { ProjectType, TOidcConfigs } from "@app/db/schemas";
import {
  ACTOR_TYPE_TO_METADATA_ID_KEY,
  EventType,
  SecretApprovalEvent,
  UserAgentType
} from "@app/domains/platform/audit-log/ce/module";
import type {
  AcmeAccountActor,
  AcmeProfileActor,
  AgentVaultProxyActor,
  EstAccountActor,
  GatewayActor,
  IdentityActor,
  KmipClientActor,
  KmipServerActor,
  MicrosoftAutoenrollmentAccountActor,
  PlatformActor,
  RelayActor,
  ScepAccountActor,
  ScimClientActor,
  ServiceActor,
  TAuditLogActorRecord,
  TAuditLogRequestActorRecord,
  UnknownUserActor,
  UserActor
} from "@app/domains/platform/audit-log/ce/module";
import { GatewayTransport } from "@app/ee/services/gateway-v2/gateway-v2-constants";
import { HoneyTokenManagedBy, HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import {
  MicrosoftAutoenrollmentFailureReason,
  MicrosoftAutoenrollmentIssuanceResult,
  MicrosoftAutoenrollmentKeytabSource
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
import { OIDC_CONFIG_AUDIT_FIELDS } from "@app/ee/services/oidc/oidc-config-types";
import { CertificateSource, PkiKeystorePasswordChange } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import { ScepEnrollmentStatus } from "@app/ee/services/pki-scep/pki-scep-types";
import {
  TCreateProjectTemplateDTO,
  TUpdateProjectTemplateDTO
} from "@app/ee/services/project-template/project-template-types";
import {
  ResourceAuthMethodType,
  TSettableAuthMethod
} from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
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
import { ActorType } from "@app/lib/auth/actor-types";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { KerberosFailureReason } from "@app/lib/kerberos";
import { TActorInput } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TCreateAppConnectionDTO, TUpdateAppConnectionDTO } from "@app/services/app-connection/app-connection-types";
import { TApprovalRequestSubjectMetadata } from "@app/services/approval-policy/approval-policy-types";
import { TIdpMfaSignal } from "@app/services/auth/idp-mfa-signal";
import { CaCrlRegenerationTrigger, CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertificateIssuanceOperation } from "@app/services/certificate-common/certificate-constants";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import {
  CertificateRenewalKeySource,
  TRenewalAuditChange,
  TRenewCertificateDTO
} from "@app/services/certificate-v3/certificate-v3-types";
import {
  CertExtendedKeyUsage,
  CertificateRevocationSource,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  CrlReason
} from "@app/services/certificate/certificate-types";
import type { ExternalMigrationImportStatus } from "@app/services/external-migration/external-migration-types";
import { TAllowedFields } from "@app/services/identity-ldap-auth/identity-ldap-auth-types";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";
import { OrgAccessRemovalCause } from "@app/services/org/org-membership-events";
import { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { PkiItemType } from "@app/services/pki-collection/pki-collection-types";
import { THealthCheckCommandResult } from "@app/services/pki-sync/pki-sync-health-check-command-fns";
import { TPostSyncCommandResult } from "@app/services/pki-sync/pki-sync-post-sync-command-fns";
import { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";
import {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TSecretSyncRaw,
  TUpdateSecretSyncDTO
} from "@app/services/secret-sync/secret-sync-types";
import { TDuplicateSecretAttributes } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";
import { CertKeySource } from "@app/services/signer/signer-enums";
import { TSignerExternalConfigurationInput } from "@app/services/signer/signer-types";
import { TWebhookPayloads } from "@app/services/webhook/webhook-types";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { KmipPermission } from "../kmip/kmip-enum";
import { AcmeChallengeType, AcmeIdentifierType } from "../pki-acme/pki-acme-schemas";
import { ApprovalStatus } from "../secret-change-request/secret-change-request-types";
import type { AuditLogEventClass } from "./audit-log-event-classes";

export type TListProjectAuditLogDTO = {
  filter: {
    userAgentType?: UserAgentType;
    eventType?: EventType[];
    eventClass?: AuditLogEventClass[];
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
} & TActorInput;

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
    | AcmeAccountActor
    | EstAccountActor
    | ScepAccountActor
    | MicrosoftAutoenrollmentAccountActor
    | GatewayActor
    | RelayActor
    | KmipServerActor
    | AgentVaultProxyActor;
  orgId?: string;
  projectId?: string;
} & BaseAuthData;

export type AuditLogInfo = Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;

// Lands in the summary event's metadata when a collapse window closes. Add it to the metadata
// type of any event you pass to createCollapsedAuditLog.
export type TAuditLogCollapseSummary = {
  suppressedRepeats?: number;
  suppressedFrom?: string;
  suppressedUntil?: string;
};

export type TCreateCollapsedAuditLogDTO = TCreateAuditLogDTO & {
  // Same event type + same parts inside the window = repeat.
  collapseKeyParts: unknown[];
  collapseWindowSeconds?: number;
};

export type TAuditLogCollapsedFlushJobData = TCreateAuditLogDTO & {
  collapseKey: string;
  windowStart: string;
  windowEnd: string;
};

export type TRecordPermissionDeniedDTO = AuditLogInfo & {
  orgId: string;
  projectId?: string;
  metadata: Omit<PermissionDeniedEvent["metadata"], keyof TAuditLogCollapseSummary>;
};

// What `pushToLog` writes to the Redis ingest stream. We pin `id` and `createdAt` at
// push time so a consumer retry (reprocessing the same batch after a failed insert)
// re-inserts byte-identical rows instead of regenerating ids and creating duplicates.
// `createdAt`/`expiresAt` are ISO strings for JSON round-tripping through the stream.
//
// org/plan/retention are also resolved at push time and travel with the entry, so the
// consumer persists it with no further DB lookups: `orgId` is the resolved org (never
// undefined for a streamed entry), `expiresAt` is the precomputed TTL boundary, and
// `projectName` is captured for project-scoped events (Postgres-only at insert time).
export type TAuditLogStreamEntry = TCreateAuditLogDTO & {
  id: string;
  createdAt: string;
  orgId: string;
  expiresAt: string;
  projectName?: string;
};

export type TAuditLogServiceFactory = {
  createAuditLog: (data: TCreateAuditLogDTO) => Promise<void>;
  createCollapsedAuditLog: (data: TCreateCollapsedAuditLogDTO) => Promise<void>;
  recordPermissionDenied: (data: TRecordPermissionDeniedDTO) => Promise<void>;
  listAuditLogs: (arg: TListProjectAuditLogDTO) => Promise<
    {
      event: {
        type: string;
        class: AuditLogEventClass;
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
  getAuditLogPostgresStorageStatus: (arg: TActorInput) => Promise<{
    clickHouseConfigured: boolean;
    auditLogGenerationDisabled: boolean;
    auditLogStorageDisabled: boolean;
    auditLogRowCount: number;
  }>;
  checkPostgresAuditLogVolumeMigrationAlert: () => Promise<void>;
};

interface BaseAuthData {
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
}

export { ACTOR_TYPE_TO_METADATA_ID_KEY, EventType, SecretApprovalEvent, UserAgentType };
export type {
  AcmeAccountActor,
  AcmeProfileActor,
  AgentVaultProxyActor,
  EstAccountActor,
  GatewayActor,
  IdentityActor,
  KmipClientActor,
  KmipServerActor,
  MicrosoftAutoenrollmentAccountActor,
  PlatformActor,
  RelayActor,
  ScepAccountActor,
  ScimClientActor,
  ServiceActor,
  UnknownUserActor,
  UserActor
};
export type Actor = TAuditLogActorRecord;
export type RequestActor = TAuditLogRequestActorRecord;

export const filterableSecretEvents: EventType[] = [
  EventType.GET_SECRET,
  EventType.GET_SECRETS,
  EventType.DELETE_SECRETS,
  EventType.CREATE_SECRETS,
  EventType.UPDATE_SECRETS,
  EventType.CREATE_SECRET,
  EventType.UPDATE_SECRET,
  EventType.DELETE_SECRET
];

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
    slug: string;
    organizationId: string;
  };
}

interface UpdateSubOrganizationEvent {
  type: EventType.UPDATE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
    organizationId: string;
  };
}

interface DeleteSubOrganizationEvent {
  type: EventType.DELETE_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
    organizationId: string;
  };
}

interface JoinSubOrganizationEvent {
  type: EventType.JOIN_SUB_ORGANIZATION;
  metadata: {
    name: string;
    slug: string;
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

// The searched value is never recorded, only how many places it was found in. An audit log is read by
// more people than the search itself is run by, so logging the value would widen who learns it.
interface SearchSecretsByValueEvent {
  type: EventType.SEARCH_SECRETS_BY_VALUE;
  metadata: {
    matchCount: number;
  };
}

interface EnableOrgWideSecretValueTrackingEvent {
  type: EventType.ENABLE_ORG_WIDE_SECRET_VALUE_TRACKING;
  metadata: {
    projectsTotal: number;
  };
}

interface DuplicateSecretEvent {
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
    attributesCopied: TDuplicateSecretAttributes;
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

interface RedactSecretVersionValueEvent {
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
  type: EventType.CREATE_IDENTITY;
  metadata: {
    identityId: string;
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
    roles?: (
      | { role: string; isTemporary: false }
      | {
          role: string;
          isTemporary: true;
          temporaryMode: string;
          temporaryRange: string;
          temporaryAccessStartTime: string;
        }
    )[];
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

interface LoginIdentityUniversalAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH_FAILED;
  metadata: {
    clientId: string;
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentityKubernetesAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_KUBERNETES_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

interface AddIdentityKubernetesAuthEvent {
  type: EventType.ADD_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
    templateId?: string | null;
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
    identityName?: string;
    kubernetesHost?: string;
    allowedNamespaces?: string;
    allowedNames?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
    templateId?: string | null;
    templateName?: string;
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

interface LoginIdentityGcpAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_GCP_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentityAwsAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_AWS_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentityAliCloudAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_ALICLOUD_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentityTlsCertAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_TLS_CERT_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

interface AddIdentityTlsCertAuthEvent {
  type: EventType.ADD_IDENTITY_TLS_CERT_AUTH;
  metadata: {
    identityId: string;
    allowedCommonNames: string | null | undefined;
    allowedSubjectAltNames: string[] | null | undefined;
    verifyClientCertificateChain: boolean;
    bindAccessTokenToCertificate: boolean;
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
    allowedSubjectAltNames: string[] | null | undefined;
    verifyClientCertificateChain?: boolean;
    bindAccessTokenToCertificate?: boolean;
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

interface LoginIdentityOciAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_OCI_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentityAzureAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_AZURE_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentityLdapAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_LDAP_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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
    identityName?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
    allowedFields?: TAllowedFields[];
    url?: string;
    templateId?: string | null;
    templateName?: string;
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

interface UpdateUserOrgMembershipEvent {
  type: EventType.UPDATE_USER_ORG_MEMBERSHIP;
  metadata: {
    membershipId: string;
    userId: string;
    role?: string;
    isActive?: boolean;
    metadataKeys?: string[];
  };
}

interface DeleteUserOrgMembershipEvent {
  type: EventType.DELETE_USER_ORG_MEMBERSHIP;
  metadata: {
    membershipId: string;
    userId: string;
  };
}

interface InviteOrgMembersEvent {
  type: EventType.INVITE_ORG_MEMBERS;
  metadata: {
    inviteeEmails: string[];
    organizationRoleSlug: string;
    projects?: { id: string; name: string }[];
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

interface LoginIdentityOidcAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_OIDC_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

interface AddIdentityOidcAuthEvent {
  type: EventType.ADD_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    templateId?: string | null;
    templateName?: string;
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
    identityName?: string;
    templateId?: string | null;
    templateName?: string;
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

interface LoginIdentityJwtAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_JWT_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
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

interface LoginIdentitySpiffeAuthEvent {
  type: EventType.LOGIN_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
    identitySpiffeAuthId: string;
    identityAccessTokenId: string;
  };
}

interface LoginIdentitySpiffeAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_SPIFFE_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

interface AddIdentitySpiffeAuthEvent {
  type: EventType.ADD_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
    trustDomain: string;
    allowedSpiffeIds: string;
    allowedAudiences: string;
    configurationType: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TIdentityTrustedIp>;
  };
}

interface UpdateIdentitySpiffeAuthEvent {
  type: EventType.UPDATE_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
    trustDomain?: string;
    allowedSpiffeIds?: string;
    allowedAudiences?: string;
    configurationType?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TIdentityTrustedIp>;
  };
}

interface DeleteIdentitySpiffeAuthEvent {
  type: EventType.REVOKE_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
  };
}

interface GetIdentitySpiffeAuthEvent {
  type: EventType.GET_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
  };
}

interface RefreshIdentitySpiffeAuthBundleEvent {
  type: EventType.REFRESH_IDENTITY_SPIFFE_AUTH_BUNDLE;
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
    hardDelete: boolean;
  };
}

interface RestoreEnvironmentEvent {
  type: EventType.RESTORE_ENVIRONMENT;
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
  metadata: {
    members: Array<{
      userId: string;
      email: string;
    }>;
  };
}

interface RemoveProjectMemberEvent {
  type: EventType.REMOVE_PROJECT_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

interface GetProjectMemberPermissionAuditEvent {
  type: EventType.GET_PROJECT_MEMBER_PERMISSION_AUDIT;
  metadata: {
    targetUserId: string;
    membershipId: string;
  };
}

interface GetProjectIdentityPermissionAuditEvent {
  type: EventType.GET_PROJECT_IDENTITY_PERMISSION_AUDIT;
  metadata: {
    targetIdentityId: string;
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

interface MoveFolderEvent {
  type: EventType.MOVE_FOLDER;
  metadata: {
    folderId: string;
    sourceEnvironment: string;
    sourcePath: string;
    destinationEnvironment: string;
    destinationPath: string;
  };
}

interface CreateWebhookEvent {
  type: EventType.CREATE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
    eventsFilter?: {
      eventName: string;
    }[];
  };
}

interface UpdateWebhookStatusEvent {
  type: EventType.UPDATE_WEBHOOK_STATUS;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
    eventsFilter?: {
      eventName: string;
    }[];
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

interface AddProjectGroupEvent {
  type: EventType.ADD_PROJECT_GROUP;
  metadata: {
    groupId: string;
    roles: string[];
  };
}

interface UpdateProjectGroupEvent {
  type: EventType.UPDATE_PROJECT_GROUP;
  metadata: {
    groupId: string;
    roles: string[];
  };
}

interface RemoveProjectGroupEvent {
  type: EventType.REMOVE_PROJECT_GROUP;
  metadata: {
    groupId: string;
  };
}

interface SecretApprovalMerge {
  type: EventType.SECRET_APPROVAL_MERGED;
  metadata: {
    mergedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
    isMergedViaBypass?: boolean;
    bypassReason?: string;
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

interface CreateGroupEvent {
  type: EventType.CREATE_GROUP;
  metadata: {
    groupId: string;
    name: string;
    slug: string;
    role: string;
  };
}

interface UpdateGroupEvent {
  type: EventType.UPDATE_GROUP;
  metadata: {
    groupId: string;
    name?: string;
    slug?: string;
    role?: string;
  };
}

interface DeleteGroupEvent {
  type: EventType.DELETE_GROUP;
  metadata: {
    groupId: string;
    name: string;
    slug: string;
  };
}

interface LinkGroupToSubOrgEvent {
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

interface UpdateGroupOrgMembershipEvent {
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

interface UnlinkGroupFromSubOrgEvent {
  type: EventType.UNLINK_GROUP_FROM_SUB_ORG;
  metadata: {
    groupId: string;
    groupName: string;
  };
}

// Written by the reconcile consumer and by direct org removals, so the actor is the platform and `reason` /
// `groupId` say why.
// `resources` are resource-level grants (PAM, Agent Vault, PKI apps, signers), including ones in projects
// only reached through a group.
interface RevokeOrgProjectAccessEvent {
  type: EventType.REVOKE_ORG_PROJECT_ACCESS;
  metadata: {
    userId?: string;
    identityId?: string;
    projectIds: string[];
    resources: { projectId: string; resourceType: string; resourceId: string }[];
    reason: OrgAccessRemovalCause;
    groupId?: string;
  };
}

interface AddUserToGroupEvent {
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

interface RemoveUserFromGroupEvent {
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

interface AddIdentityToGroupEvent {
  type: EventType.ADD_IDENTITY_TO_GROUP;
  metadata: {
    groupId: string;
    groupName: string;
    identityId: string;
  };
}

interface RemoveIdentityFromGroupEvent {
  type: EventType.REMOVE_IDENTITY_FROM_GROUP;
  metadata: {
    groupId: string;
    groupName: string;
    identityId: string;
  };
}

interface AddGroupToProjectEvent {
  type: EventType.ADD_GROUP_TO_PROJECT;
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

interface UpdateGroupProjectMembershipEvent {
  type: EventType.UPDATE_GROUP_PROJECT_MEMBERSHIP;
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

interface RemoveGroupFromProjectEvent {
  type: EventType.REMOVE_GROUP_FROM_PROJECT;
  metadata: {
    groupId: string;
    groupName: string;
  };
}

type TCaKeySourceAuditMetadata = {
  keySource?: string;
  hsmConnectorId?: string;
  hsmConnectorName?: string;
  appConnectionId?: string;
  appConnectionName?: string;
  externalKeyId?: string;
  region?: string;
};

interface CreateCa {
  type: EventType.CREATE_CA;
  metadata: TCaKeySourceAuditMetadata & {
    caId: string;
    name: string;
    dn?: string;
    isOcspEnabled?: boolean;
    crlValidityDays?: number;
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
    isOcspEnabled?: boolean;
    crlValidityDays?: number;
  };
}

interface DeleteCa {
  type: EventType.DELETE_CA;
  metadata: TCaKeySourceAuditMetadata & {
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

interface ExportCertManagerProject {
  type: EventType.EXPORT_CERT_MANAGER_PROJECT;
  metadata: {
    sourceProjectId: string;
    destinationProjectId: string;
    exportedCertificateAuthorities: number;
    renamedCertificateAuthorities: { originalName: string; newName: string }[];
    exportedCertificatePolicies: number;
    renamedCertificatePolicies: { originalName: string; newName: string }[];
    exportedCertificateProfiles: number;
    skippedCertificateProfiles: number;
    renamedCertificateProfiles: { originalSlug: string; newSlug: string }[];
  };
}

interface GetCaCsr {
  type: EventType.GET_CA_CSR;
  metadata: {
    caId: string;
    dn: string;
    maxPathLength?: number;
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

interface ImportCaCrossSignedCert {
  type: EventType.IMPORT_CA_CROSS_SIGNED_CERT;
  metadata: {
    caId: string;
    caName: string;
    issuer: string;
    serialNumber: string;
    notAfter: string;
    replacedSerialNumber?: string;
  };
}

interface DeleteCaCrossSignedCert {
  type: EventType.DELETE_CA_CROSS_SIGNED_CERT;
  metadata: {
    caId: string;
    caName: string;
    issuer: string;
    serialNumber: string;
    notAfter: string;
  };
}

interface GetCaCrls {
  type: EventType.GET_CA_CRLS;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface RegenerateCaCrl {
  type: EventType.REGENERATE_CA_CRL;
  metadata: {
    caId: string;
    caName: string;
    crlId: string;
    crlNumber: number;
    thisUpdate: string;
    nextUpdate: string;
    trigger: CaCrlRegenerationTrigger;
  };
}

interface GenerateCaCertificate {
  type: EventType.GENERATE_CA_CERTIFICATE;
  metadata: {
    caId: string;
    dn: string;
    serialNumber: string;
    parentCaId?: string;
  };
}

interface InstallCaCertVenafi {
  type: EventType.INSTALL_CA_CERT_VENAFI;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface InstallCaCertAdcs {
  type: EventType.INSTALL_CA_CERT_ADCS;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface CreateCaSigningConfig {
  type: EventType.CREATE_CA_SIGNING_CONFIG;
  metadata: {
    caId: string;
    dn: string;
    signingConfigType: string;
  };
}

interface GetCaSigningConfig {
  type: EventType.GET_CA_SIGNING_CONFIG;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface UpdateCaSigningConfig {
  type: EventType.UPDATE_CA_SIGNING_CONFIG;
  metadata: {
    caId: string;
    dn: string;
    signingConfigType: string;
  };
}

interface GetCaAutoRenewalConfig {
  type: EventType.GET_CA_AUTO_RENEWAL_CONFIG;
  metadata: {
    caId: string;
    dn: string;
  };
}

interface UpdateCaAutoRenewalConfig {
  type: EventType.UPDATE_CA_AUTO_RENEWAL_CONFIG;
  metadata: {
    caId: string;
    dn: string;
    autoRenewalEnabled?: boolean;
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
    applicationId?: string | null;
    applicationName?: string | null;
    certificateProfileId?: string;
    profileName?: string;
    caId?: string;
    caName?: string;
    hasCsr?: boolean;
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
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

interface DeleteCert {
  type: EventType.DELETE_CERT;
  metadata: {
    certId: string;
    cn: string;
    friendlyName?: string | null;
    serialNumber: string;
    notAfter: string;
    source: CertificateSource;
    statusAtDeletion: CertStatus;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

interface RevokeCert {
  type: EventType.REVOKE_CERT;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
    revocationReason?: CrlReason;
    approvalRequestId?: string;
    requesterName?: string;
    requesterEmail?: string;
    crlWarning?: string;
    source?: CertificateRevocationSource;
    revokedThroughCertId?: string;
    revokedThroughCertName?: string;
  };
}

interface RequestCertRevocation {
  type: EventType.REQUEST_CERT_REVOCATION;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
    revocationReason: CrlReason;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    approvalPolicyId: string;
    approvalPolicyName: string;
  };
}

interface CertRevocationFailed {
  type: EventType.CERT_REVOCATION_FAILED;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId: string;
    applicationName?: string | null;
    revocationReason: CrlReason;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    error: string;
  };
}

interface AssignCertToApplication {
  type: EventType.ASSIGN_CERT_TO_APPLICATION;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId: string;
    applicationName: string;
  };
}

interface GetCertBody {
  type: EventType.GET_CERT_BODY;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

interface GetCertPrivateKey {
  type: EventType.GET_CERT_PRIVATE_KEY;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

interface GetCertBundle {
  type: EventType.GET_CERT_BUNDLE;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}
interface GetCertPkcs12 {
  type: EventType.EXPORT_CERT_PKCS12;
  metadata: {
    certId: string;
    cn: string;
    serialNumber: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

interface CreatePkiAlert {
  type: EventType.CREATE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    pkiCollectionId?: string;
    applicationId?: string;
    applicationName?: string;
    name: string;
    alertBefore?: string;
    eventType: PkiAlertEventType;
    recipientEmails?: string;
  };
}
interface GetPkiAlert {
  type: EventType.GET_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface UpdatePkiAlert {
  type: EventType.UPDATE_PKI_ALERT;
  metadata: {
    pkiAlertId: string;
    pkiCollectionId?: string;
    applicationId?: string;
    applicationName?: string;
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
    applicationId?: string;
    applicationName?: string;
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

interface CreateCertificateInventoryView {
  type: EventType.CREATE_CERTIFICATE_INVENTORY_VIEW;
  metadata: {
    viewId: string;
    name: string;
    filters?: Record<string, unknown>;
    columns?: string[];
    isShared?: boolean;
    applicationId?: string;
    applicationName?: string;
  };
}

interface UpdateCertificateInventoryView {
  type: EventType.UPDATE_CERTIFICATE_INVENTORY_VIEW;
  metadata: {
    viewId: string;
    name?: string;
    filters?: Record<string, unknown>;
    columns?: string[];
    isShared?: boolean;
    applicationId?: string;
    applicationName?: string;
  };
}

interface DeleteCertificateInventoryView {
  type: EventType.DELETE_CERTIFICATE_INVENTORY_VIEW;
  metadata: {
    viewId: string;
    name: string;
    applicationId?: string;
    applicationName?: string;
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
    newCertificateId?: string;
    certificateRequestId?: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    profileId: string;
    renewBeforeDays: string;
    profileName: string;
    status: CertificateRequestStatus;
    serialNumber?: string;
  };
}

interface AutomatedRenewCertificateFailed {
  type: EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED;
  metadata: {
    certificateId: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    profileId: string;
    renewBeforeDays: string;
    profileName: string;
    error: string;
  };
}

interface CertificateIssuanceFailedEvent {
  type: EventType.CERTIFICATE_ISSUANCE_FAILED;
  metadata: TAuditLogCollapseSummary & {
    operation: CertificateIssuanceOperation;
    enrollmentType?: EnrollmentType;
    certificateProfileId?: string;
    profileName?: string;
    caId?: string;
    caName?: string;
    certificateRequestId?: string;
    originalCertificateId?: string;
    commonName?: string;
    applicationId?: string;
    applicationName?: string;
    errorName: string;
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

export type TMfaSatisfiedBy = "not-required" | "infisical" | "idp";

interface UserLoginEvent {
  type: EventType.USER_LOGIN;
  metadata: {
    organizationId?: string;
    authProvider?: string;
    idpMfa?: TIdpMfaSignal;
  };
}

interface SelectOrganizationEvent {
  type: EventType.SELECT_ORGANIZATION;
  metadata: {
    organizationId: string;
    organizationName: string;
    mfaSatisfiedBy?: TMfaSatisfiedBy;
  };
}

// The session was issued by another root org's IdP, which does not satisfy this org's enforcement.
interface SelectOrganizationRefusedEvent {
  type: EventType.SELECT_ORGANIZATION_REFUSED;
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
    mfaSatisfiedBy?: TMfaSatisfiedBy;
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

interface GetAdcsTemplatesEvent {
  type: EventType.GET_ADCS_TEMPLATES;
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
        customExtensionOids?: string[];
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
        customExtensionOids?: string[];
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

interface CreatePkiApplication {
  type: EventType.CREATE_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
    profileIds?: string[];
  };
}

interface UpdatePkiApplication {
  type: EventType.UPDATE_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
  };
}

interface DeletePkiApplication {
  type: EventType.DELETE_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
  };
}

interface GetPkiApplication {
  type: EventType.GET_PKI_APPLICATION;
  metadata: {
    applicationId: string;
    name: string;
  };
}

interface ListPkiApplications {
  type: EventType.LIST_PKI_APPLICATIONS;
  metadata: {
    projectId: string;
  };
}

interface AttachPkiApplicationProfiles {
  type: EventType.ATTACH_PKI_APPLICATION_PROFILES;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileIds: string[];
  };
}

interface DetachPkiApplicationProfile {
  type: EventType.DETACH_PKI_APPLICATION_PROFILE;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileId: string;
  };
}

interface AddPkiApplicationMember {
  type: EventType.ADD_PKI_APPLICATION_MEMBER;
  metadata: {
    applicationId: string;
    applicationName?: string;
    membershipId: string;
    userId?: string;
    userName?: string;
    identityId?: string;
    identityName?: string;
    groupId?: string;
    groupName?: string;
    role: string;
  };
}

interface UpdatePkiApplicationMemberRole {
  type: EventType.UPDATE_PKI_APPLICATION_MEMBER_ROLE;
  metadata: {
    applicationId: string;
    applicationName?: string;
    membershipId: string;
    userId?: string;
    userName?: string;
    identityId?: string;
    identityName?: string;
    groupId?: string;
    groupName?: string;
    role: string;
  };
}

interface RemovePkiApplicationMember {
  type: EventType.REMOVE_PKI_APPLICATION_MEMBER;
  metadata: {
    applicationId: string;
    applicationName?: string;
    membershipId: string;
    userId?: string;
    userName?: string;
    identityId?: string;
    identityName?: string;
    groupId?: string;
    groupName?: string;
  };
}

interface ListPkiApplicationMembers {
  type: EventType.LIST_PKI_APPLICATION_MEMBERS;
  metadata: {
    applicationId: string;
    applicationName?: string;
  };
}

interface GetPkiApplicationEnrollment {
  type: EventType.GET_PKI_APPLICATION_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface SetPkiApplicationApiEnrollment {
  type: EventType.SET_PKI_APPLICATION_API_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    autoRenew: boolean;
    renewBeforeDays: number | null;
  };
}

interface ClearPkiApplicationApiEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_API_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface SetPkiApplicationEstEnrollment {
  type: EventType.SET_PKI_APPLICATION_EST_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    disableBootstrapCaValidation: boolean;
  };
}

interface ClearPkiApplicationEstEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_EST_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface SetPkiApplicationAcmeEnrollment {
  type: EventType.SET_PKI_APPLICATION_ACME_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    skipDnsOwnershipVerification: boolean;
    skipEabBinding: boolean;
  };
}

interface ClearPkiApplicationAcmeEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_ACME_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface RevealPkiApplicationAcmeEabSecret {
  type: EventType.REVEAL_PKI_APPLICATION_ACME_EAB_SECRET;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface RotatePkiApplicationAcmeEabSecret {
  type: EventType.ROTATE_PKI_APPLICATION_ACME_EAB_SECRET;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface SetPkiApplicationScepEnrollment {
  type: EventType.SET_PKI_APPLICATION_SCEP_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    challengeType: string;
    signRaWithCa: boolean;
    validationConnectionId?: string;
    validationConnectionName?: string;
  };
}

interface ClearPkiApplicationScepEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_SCEP_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
  };
}

interface SetPkiApplicationMicrosoftAutoenrollmentEnrollment {
  type: EventType.SET_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    profileName: string;
    servicePrincipalName: string;
    keyVersion: number;
    connectionId: string;
    connectionName: string;
    allowedGroups: { sid: string; name: string }[];
    renewBeforeDays: number;
    allowAnyChannelBinding: boolean;
    keytabSource: MicrosoftAutoenrollmentKeytabSource;
    reusedFromProfileId?: string;
    reusedFromProfileName?: string;
  };
}

interface ClearPkiApplicationMicrosoftAutoenrollmentEnrollment {
  type: EventType.CLEAR_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_ENROLLMENT;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    profileName: string;
  };
}

interface ReenrollPkiApplicationMicrosoftAutoenrollmentComputers {
  type: EventType.REENROLL_PKI_APPLICATION_MICROSOFT_AUTOENROLLMENT_COMPUTERS;
  metadata: {
    applicationId: string;
    applicationName: string;
    profileId: string;
    profileName: string;
    templateMajorRevision: number;
  };
}

interface GetCertManagerInstanceState {
  type: EventType.GET_CERT_MANAGER_INSTANCE_STATE;
  metadata: {
    activeProjectId: string | null;
    projectCount: number;
    isMultiInstance: boolean;
  };
}

interface SetCertManagerActiveProject {
  type: EventType.SET_CERT_MANAGER_ACTIVE_PROJECT;
  metadata: {
    activeProjectId: string;
    previousActiveProjectId: string | null;
    projectName: string;
  };
}

interface InviteCertManagerUsers {
  type: EventType.INVITE_CERT_MANAGER_USERS;
  metadata: {
    emails: string[];
    usernames: string[];
    userIds: string[];
    membershipIds: string[];
    roleSlugs?: string[];
  };
}

interface UpdateCertManagerUser {
  type: EventType.UPDATE_CERT_MANAGER_USER;
  metadata: {
    userId: string;
    roles: string[];
  };
}

interface RemoveCertManagerUser {
  type: EventType.REMOVE_CERT_MANAGER_USER;
  metadata: {
    userId: string;
    membershipId: string;
  };
}

interface RemoveCertManagerUsersBatch {
  type: EventType.REMOVE_CERT_MANAGER_USERS_BATCH;
  metadata: {
    emails: string[];
    usernames: string[];
    userIds: string[];
    membershipIds: string[];
  };
}

interface AddCertManagerIdentity {
  type: EventType.ADD_CERT_MANAGER_IDENTITY;
  metadata: {
    identityId: string;
    membershipId: string;
    roles: string[];
  };
}

interface UpdateCertManagerIdentity {
  type: EventType.UPDATE_CERT_MANAGER_IDENTITY;
  metadata: {
    identityId: string;
    membershipId: string;
    roles: string[];
  };
}

interface RemoveCertManagerIdentity {
  type: EventType.REMOVE_CERT_MANAGER_IDENTITY;
  metadata: {
    identityId: string;
    membershipId: string;
  };
}

interface AddCertManagerGroup {
  type: EventType.ADD_CERT_MANAGER_GROUP;
  metadata: {
    groupId: string;
    membershipId: string;
    roles: string[];
  };
}

interface UpdateCertManagerGroup {
  type: EventType.UPDATE_CERT_MANAGER_GROUP;
  metadata: {
    groupId: string;
    membershipId: string;
    roles: string[];
  };
}

interface RemoveCertManagerGroup {
  type: EventType.REMOVE_CERT_MANAGER_GROUP;
  metadata: {
    groupId: string;
    membershipId: string;
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
    certificateRequestId: string;
    commonName: string;
    profileName: string;
    status: CertificateRequestStatus;
    serialNumber?: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface SignCertificateFromProfile {
  type: EventType.SIGN_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateId: string;
    certificateRequestId: string;
    profileName: string;
    commonName: string;
    status: CertificateRequestStatus;
    serialNumber?: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface OrderCertificateFromProfile {
  type: EventType.ORDER_CERTIFICATE_FROM_PROFILE;
  metadata: {
    certificateProfileId: string;
    certificateRequestId: string;
    commonName: string;
    profileName: string;
    status: CertificateRequestStatus;
    serialNumber?: string;
    applicationId?: string;
    applicationName?: string;
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
    certificateRequestId: string;
    profileName: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    serialNumber?: string;
    renewalKeySource: CertificateRenewalKeySource;
    externalConfiguration?: TRenewCertificateDTO["externalConfiguration"];
    changedAttributes: TRenewalAuditChange[];
    status?: CertificateRequestStatus;
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
    encryptionAlgorithm: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;
    isExportable?: boolean;
    hasDeleteProtection?: boolean;
    isPublicKeyPublished?: boolean;
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
    keyName: string;
    name?: string;
    description?: string;
    hasDeleteProtection?: boolean;
    isPublicKeyPublished?: boolean;
  };
}

interface RotateCmekEvent {
  type: EventType.ROTATE_CMEK;
  metadata: {
    keyId: string;
    version: number;
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

interface CmekGenerateMacEvent {
  type: EventType.CMEK_GENERATE_MAC;
  metadata: {
    keyId: string;
    macAlgorithm: HmacAlgorithm;
    mac: string;
  };
}

interface CmekVerifyMacEvent {
  type: EventType.CMEK_VERIFY_MAC;
  metadata: {
    keyId: string;
    macAlgorithm: HmacAlgorithm;
    mac: string;
    macValid: boolean;
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

interface CmekBulkGetPrivateKeysEvent {
  type: EventType.CMEK_BULK_EXPORT_PRIVATE_KEYS;
  metadata: {
    keys: { keyId: string; name: string }[];
  };
}

interface CmekBulkImportKeysEvent {
  type: EventType.CMEK_BULK_IMPORT_KEYS;
  metadata: {
    keyNames: string[];
    failedKeyNames: string[];
    projectId: string;
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

interface RotateAppConnectionCredentialsEvent {
  type: EventType.ROTATE_APP_CONNECTION_CREDENTIALS;
  metadata: {
    connectionId: string;
  };
}

interface CreateHsmConnectorEvent {
  type: EventType.CREATE_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
    gatewayId: string | null;
    gatewayPoolId: string | null;
  };
}

interface UpdateHsmConnectorEvent {
  type: EventType.UPDATE_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
    fieldsUpdated: string[];
  };
}

interface DeleteHsmConnectorEvent {
  type: EventType.DELETE_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
  };
}

interface TestHsmConnectorEvent {
  type: EventType.TEST_HSM_CONNECTOR;
  metadata: {
    connectorId: string;
    name: string;
    ok: boolean;
    memberCount: number;
  };
}

interface CreateGitHubAppEvent {
  type: EventType.CREATE_GITHUB_APP;
  metadata: {
    gitHubAppId: string;
    name: string;
    appId: string;
    slug: string;
    owner?: string | null;
    host?: string | null;
    instanceType: string;
    projectId?: string | null;
  };
}

interface DeleteGitHubAppEvent {
  type: EventType.DELETE_GITHUB_APP;
  metadata: {
    gitHubAppId: string;
    name: string;
    appId: string;
    slug: string;
    projectId?: string | null;
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
    emails?: string[];
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
    createdSecretKeys?: string[];
    updatedSecretKeys?: string[];
    deletedSecretKeys?: string[];
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
    applicationId?: string;
    applicationName?: string;
  };
}

interface GetPkiSyncCertificatesEvent {
  type: EventType.GET_PKI_SYNC_CERTIFICATES;
  metadata: {
    syncId: string;
    count: number;
    certificateIds: string[];
    destination: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface CreatePkiSyncEvent {
  type: EventType.CREATE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    destination: string;
    applicationId?: string;
    applicationName?: string;
    connectionId?: string;
    connectionName?: string;
    targetHost?: string;
    hasCredentials?: boolean;
    hasPostSyncCommand?: boolean;
    hasHealthCheckCommand?: boolean;
    hasFilters?: boolean;
  };
}

interface UpdatePkiSyncEvent {
  type: EventType.UPDATE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    applicationId?: string;
    applicationName?: string;
    destination?: string;
    connectionId?: string;
    connectionName?: string;
    targetHost?: string;
    hasPostSyncCommand?: boolean;
    hasHealthCheckCommand?: boolean;
    hasFilters?: boolean;
  };
}

interface DeletePkiSyncEvent {
  type: EventType.DELETE_PKI_SYNC;
  metadata: {
    pkiSyncId: string;
    name: string;
    destination: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface PkiSyncSyncCertificatesEvent {
  type: EventType.PKI_SYNC_SYNC_CERTIFICATES;
  metadata: {
    syncId: string;
    syncMessage: string | null;
    jobId: string;
    jobRanAt: Date;
    healthCheck?: { command: string; result?: THealthCheckCommandResult };
    postSyncCommand?: { command: string; result?: TPostSyncCommandResult };
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

interface PkiSyncTestHealthCheckEvent {
  type: EventType.PKI_SYNC_TEST_HEALTH_CHECK;
  metadata: {
    connectionId: string;
    connectionName: string;
    destination: string;
    command: string;
    result?: THealthCheckCommandResult;
  };
}

interface PkiSyncHealthCheckEvent {
  type: EventType.PKI_SYNC_HEALTH_CHECK;
  metadata: {
    syncId: string;
    syncName: string;
    destination: string;
    command: string;
    result?: THealthCheckCommandResult;
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

interface PkiSyncLinkCertificatesEvent {
  type: EventType.PKI_SYNC_LINK_CERTIFICATES;
  metadata: {
    pkiSyncId: string;
    name: string;
    count: number;
    certificates: { id: string; commonName: string }[];
    applicationId?: string;
    applicationName?: string;
  };
}

interface PkiSyncUnlinkCertificatesEvent {
  type: EventType.PKI_SYNC_UNLINK_CERTIFICATES;
  metadata: {
    pkiSyncId: string;
    name: string;
    count: number;
    certificates: { id: string; commonName: string }[];
    removedFromDestination?: boolean;
    applicationId?: string;
    applicationName?: string;
  };
}

interface PkiSyncSkipCertificateEvent {
  type: EventType.PKI_SYNC_SKIP_CERTIFICATE;
  metadata: {
    pkiSyncId: string;
    name: string;
    certificateId: string;
    commonName: string;
    reason: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface PkiSyncSetDefaultCertificateEvent {
  type: EventType.PKI_SYNC_SET_DEFAULT_CERTIFICATE;
  metadata: {
    pkiSyncId: string;
    name: string;
    certificateId: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface PkiSyncClearDefaultCertificateEvent {
  type: EventType.PKI_SYNC_CLEAR_DEFAULT_CERTIFICATE;
  metadata: {
    pkiSyncId: string;
    name: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface CreatePkiDiscoveryEvent {
  type: EventType.CREATE_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

interface UpdatePkiDiscoveryEvent {
  type: EventType.UPDATE_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

interface DeletePkiDiscoveryEvent {
  type: EventType.DELETE_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

interface GetPkiDiscoveryEvent {
  type: EventType.GET_PKI_DISCOVERY;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

interface GetPkiDiscoveriesEvent {
  type: EventType.GET_PKI_DISCOVERIES;
  metadata: {
    count: number;
  };
}

interface TriggerPkiDiscoveryScanEvent {
  type: EventType.TRIGGER_PKI_DISCOVERY_SCAN;
  metadata: {
    discoveryId: string;
    name: string;
  };
}

interface GetPkiInstallationEvent {
  type: EventType.GET_PKI_INSTALLATION;
  metadata: {
    installationId: string;
    name?: string;
  };
}

interface GetPkiInstallationsEvent {
  type: EventType.GET_PKI_INSTALLATIONS;
  metadata: {
    count: number;
  };
}

interface UpdatePkiInstallationEvent {
  type: EventType.UPDATE_PKI_INSTALLATION;
  metadata: {
    installationId: string;
    name?: string;
    type?: string;
    keystorePasswordChange?: PkiKeystorePasswordChange;
  };
}

interface DeletePkiInstallationEvent {
  type: EventType.DELETE_PKI_INSTALLATION;
  metadata: {
    installationId: string;
    name: string | null;
  };
}

interface CreatePkiSignerEvent {
  type: EventType.CREATE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
    certificateId?: string | null;
    caId?: string | null;
    commonName?: string | null;
    approvalPolicyId?: string | null;
    keySource?: CertKeySource;
    hsmConnectorId?: string | null;
    hsmKeyLabel?: string;
    hsmKeyId?: string;
    externalConfiguration?: TSignerExternalConfigurationInput;
  };
}

interface UpdatePkiSignerEvent {
  type: EventType.UPDATE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

interface DeletePkiSignerEvent {
  type: EventType.DELETE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

interface GetPkiSignerEvent {
  type: EventType.GET_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

interface GetPkiSignersEvent {
  type: EventType.GET_PKI_SIGNERS;
  metadata: {
    count: number;
    offset: number;
    limit: number;
  };
}

interface GetPkiSignerPublicKeyEvent {
  type: EventType.GET_PKI_SIGNER_PUBLIC_KEY;
  metadata: {
    signerId: string;
    name: string;
  };
}

interface GetPkiSigningOperationsEvent {
  type: EventType.GET_PKI_SIGNING_OPERATIONS;
  metadata: {
    signerId: string;
    signerName: string;
    count: number;
  };
}

interface GetPkiSigningOperationEvent {
  type: EventType.GET_PKI_SIGNING_OPERATION;
  metadata: {
    signerId: string;
    signerName: string;
    operationId: string;
  };
}

interface PkiSignerSignEvent {
  type: EventType.PKI_SIGNER_SIGN;
  metadata: {
    signerId: string;
    name: string;
    signingAlgorithm: string;
  };
}

interface EnablePkiSignerEvent {
  type: EventType.ENABLE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

interface DisablePkiSignerEvent {
  type: EventType.DISABLE_PKI_SIGNER;
  metadata: {
    signerId: string;
    name: string;
  };
}

interface ReissuePkiSignerCertificateEvent {
  type: EventType.REISSUE_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    caId: string;
    commonName?: string;
    keyAlgorithm?: string;
    keySource?: string;
    hsmConnectorId?: string;
    hsmKeyAlgorithm?: string;
    externalConfiguration?: TSignerExternalConfigurationInput;
  };
}

interface RenewPkiSignerCertificateEvent {
  type: EventType.RENEW_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    status: string;
    caId: string;
    caName: string;
    previousSerialNumber: string | null;
  };
}

interface RevokePkiSignerCertificateEvent {
  type: EventType.REVOKE_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    certificateId: string;
    certificateCommonName: string;
    serialNumber: string;
    revocationReason: CrlReason;
    status: string;
    digicertRevocationRequestId?: number;
  };
}

interface PkiSignerCertificateRevocationDecidedEvent {
  type: EventType.PKI_SIGNER_CERTIFICATE_REVOCATION_DECIDED;
  metadata: {
    signerId: string;
    name: string;
    certificateId: string;
    certificateCommonName: string;
    serialNumber: string;
    revocationReason: CrlReason;
    digicertRevocationRequestId?: number;
    decision: string;
    status: string;
  };
}

interface PkiSignerCertificateRevokedByCaEvent {
  type: EventType.PKI_SIGNER_CERTIFICATE_REVOKED_BY_CA;
  metadata: {
    signerId: string;
    name: string;
    certificateId: string;
    certificateCommonName: string;
    serialNumber: string;
    previousStatus: string;
    status: string;
  };
}

interface ImportPkiSignerCertificateEvent {
  type: EventType.IMPORT_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    caId: string;
    caName: string;
    externalOrderId: string;
    certificateId?: string | null;
    commonName?: string;
    keyAlgorithm?: string;
    hsmConnectorId: string;
    hsmConnectorName: string;
    hsmKeyLabel: string;
    hsmKeyId?: string;
    certificateRenewBeforeDays?: number | null;
  };
}

interface ExportPkiSignerCertificateEvent {
  type: EventType.EXPORT_PKI_SIGNER_CERTIFICATE;
  metadata: {
    signerId: string;
    name: string;
    serialNumber: string;
  };
}

interface UpdatePkiSignerApprovalPolicyEvent {
  type: EventType.UPDATE_PKI_SIGNER_APPROVAL_POLICY;
  metadata: {
    signerId: string;
    name: string;
    stepCount: number;
  };
}

interface PkiSignerRequestToSignEvent {
  type: EventType.PKI_SIGNER_REQUEST_TO_SIGN;
  metadata: {
    signerId: string;
    name: string;
    approvalRequestId?: string;
  };
}

interface PkiSignerPreApproveSigningEvent {
  type: EventType.PKI_SIGNER_PRE_APPROVE_SIGNING;
  metadata: {
    signerId: string;
    name: string;
    approvalRequestId?: string;
    granteeUserId?: string;
    granteeIdentityId?: string;
  };
}

interface PkiSignerRevokeRequestEvent {
  type: EventType.PKI_SIGNER_REVOKE_REQUEST;
  metadata: {
    signerId: string;
    name: string;
    approvalRequestId: string;
  };
}

interface AddPkiSignerMemberEvent {
  type: EventType.ADD_PKI_SIGNER_MEMBER;
  metadata: {
    signerId: string;
    kind: string;
    role?: string;
    added?: number;
    userIds?: string[];
    identityId?: string;
    groupId?: string;
  };
}

interface UpdatePkiSignerMemberEvent {
  type: EventType.UPDATE_PKI_SIGNER_MEMBER;
  metadata: {
    signerId: string;
    kind: string;
    memberId: string;
    role: string;
  };
}

interface RemovePkiSignerMemberEvent {
  type: EventType.REMOVE_PKI_SIGNER_MEMBER;
  metadata: {
    signerId: string;
    kind: string;
    memberId: string;
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

interface OidcProvisionedPlaceholderAdoptedEvent {
  type: EventType.OIDC_PROVISIONED_PLACEHOLDER_ADOPTED;
  metadata: {
    userId: string;
    externalId: string;
    previousUsername: string;
    newUsername: string;
  };
}

interface SsoUserProfileSyncedEvent {
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

interface SsoUserEmailSyncSkippedEvent {
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
    keyAlgorithm?: string;
    serialNumber: string;
    isFromCsr: boolean;
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

interface KmipServerConnectEvent {
  type: EventType.KMIP_SERVER_CONNECT;
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

interface MoveSecretRotationEvent {
  type: EventType.MOVE_SECRET_ROTATION;
  metadata: {
    type: string;
    rotationId: string;
    sourceEnvironment: string;
    sourceSecretPath: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
  };
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

interface CheckSecretRotationCredentialsEvent {
  type: EventType.SECRET_ROTATION_CHECK_CREDENTIALS;
  metadata: {
    type: string;
    rotationId: string;
    connectionId: string;
    folderId: string;
    success: boolean;
    errorMessage?: string;
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
    filteredActorId?: string;
    filteredActorName?: string;
    filteredActorType?: string;
  };
}

interface GetProjectPitCommitAuthorsEvent {
  type: EventType.GET_PROJECT_PIT_COMMIT_AUTHORS;
  metadata: {
    environment: string;
    path: string;
    authorCount: string;
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
    approvalSlug?: string;
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
  metadata: Omit<TCreateSecretScanningDataSourceDTO, "projectId" | "alerts"> & {
    dataSourceId: string;
    alerts?: { eventType: string; channelTypes: string[] }[];
  };
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
    resourceName: string;
    dataSourceId: string;
    dataSourceName: string;
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

interface SecretScanningResourceAddEvent {
  type: EventType.SECRET_SCANNING_RESOURCE_ADD;
  metadata: {
    type: SecretScanningDataSource;
    dataSourceId: string;
    dataSourceName: string;
    resources: { resourceId: string; resourceName: string }[];
  };
}

interface SecretScanningResourceRemoveEvent {
  type: EventType.SECRET_SCANNING_RESOURCE_REMOVE;
  metadata: {
    type: SecretScanningDataSource;
    dataSourceId: string;
    dataSourceName: string;
    resourceId: string;
    resourceName: string;
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

interface SecretScanningFindingLocationListEvent {
  type: EventType.SECRET_SCANNING_FINDING_LOCATION_LIST;
  metadata: {
    findingId: string;
    findingRule: string;
    resourceId: string;
    resourceName: string;
    count: number;
  };
}

interface SecretScanningFindingUpdateEvent {
  type: EventType.SECRET_SCANNING_FINDING_UPDATE;
  metadata: TUpdateSecretScanningFindingDTO & { findingRule: string; resourceId: string; resourceName: string };
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

interface OrgSsoSettingsUpdateEvent {
  type: EventType.UPDATE_ORG_SSO_SETTINGS;
  metadata: {
    authEnforced?: boolean;
    googleSsoAuthEnforced?: boolean;
    bypassOrgAuthEnabled?: boolean;
    ssoMfaTrust?: string;
  };
}

type TOidcConfigAuditFields = Pick<TOidcConfigs, (typeof OIDC_CONFIG_AUDIT_FIELDS)[number]>;

interface CreateOidcConfigEvent {
  type: EventType.CREATE_OIDC_CONFIG;
  metadata: {
    oidcConfigId: string;
    organizationName: string;
  } & TOidcConfigAuditFields;
}

interface UpdateOidcConfigEvent {
  type: EventType.UPDATE_OIDC_CONFIG;
  metadata: {
    oidcConfigId: string;
    organizationName: string;
    clientCredentialsUpdated: boolean;
    ssoEnforcementDisabled: boolean;
  } & Partial<TOidcConfigAuditFields>;
}

interface DeleteOidcConfigEvent {
  type: EventType.DELETE_OIDC_CONFIG;
  metadata: {
    oidcConfigId: string;
    organizationName: string;
  };
}

interface OrgAiConfigUpdateEvent {
  type: EventType.UPDATE_ORG_AI_CONFIG;
  metadata: {
    connectionId: string | null;
    connectionName: string | null;
    model: string | null;
  };
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
    // true: actor soft-deleted the project (marked for deletion).
    // false: the async cleanup worker hard-deleted an expired soft-deleted project.
    softDelete?: boolean;
    // true: deleted without a restore window (Delete Now, or a project type that has none).
    hardDelete?: boolean;
    deleteAfter?: Date | null;
  };
}

interface ProjectRestoreEvent {
  type: EventType.RESTORE_PROJECT;
  metadata: {
    id: string;
    name: string;
    slug: string;
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

interface SearchSecretsByMetadataEvent {
  type: EventType.SEARCH_SECRETS_BY_METADATA;
  metadata: {
    operator: string;
    filters: { key: string; value: string; operator: string }[];
    tags?: string[];
    numberOfSecrets: number;
    secrets: { id: string; secretKey: string; environment: string; secretPath: string }[];
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

interface ViewSecretManagementInsightsCalendarEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_CALENDAR;
  metadata: {
    projectId: string;
    month: number;
    year: number;
  };
}

interface ViewSecretManagementInsightsAccessVolumeEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_VOLUME;
  metadata: {
    projectId: string;
  };
}

interface ViewSecretManagementInsightsUnusedAccessEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_UNUSED_ACCESS;
  metadata: {
    projectId: string;
    // Set when one principal's unused secrets were viewed rather than the project list.
    principalType?: string;
    principalId?: string;
    principalName?: string;
  };
}

interface ViewSecretManagementInsightsOrgAuthMethodDistributionEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ORG_AUTH_METHOD_DISTRIBUTION;
  metadata: {
    totalFetches: number;
  };
}

interface ViewSecretManagementInsightsAccessLocationsEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_LOCATIONS;
  metadata: {
    projectId: string;
    days: number;
  };
}

interface ViewInsightsAuthMethodsEvent {
  type: EventType.VIEW_INSIGHTS_AUTH_METHODS;
  metadata: {
    projectId: string;
    days: number;
  };
}

interface ViewSecretManagementInsightsSummaryEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_SUMMARY;
  metadata: {
    projectId: string;
  };
}

interface ViewInsightsOrgSecretsDuplicationEvent {
  type: EventType.VIEW_INSIGHTS_ORG_SECRETS_DUPLICATION;
  metadata: {
    groupCount: number;
  };
}

interface ViewInsightsSecretsDuplicationEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_DUPLICATION;
  metadata: {
    projectId: string;
  };
}

interface ViewSecretManagementInsightsCountsEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_COUNTS;
  metadata: {
    projectId: string;
  };
}

interface ViewSecretManagementInsightsUsageEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_USAGE;
  metadata: {
    activeLeases: number;
    users: number;
    identities: number;
  };
}

interface ViewSecretManagementInsightsProjectWarningsEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_PROJECT_WARNINGS;
  metadata: {
    totalProjects: number;
    projectsWithIssues: number;
    offset: number;
    limit: number;
  };
}

interface CreateAuditReportEvent {
  type: EventType.CREATE_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    projectId: string;
    reportTypes: string[];
    recipientCount: number;
  };
}

interface GetAuditReportsEvent {
  type: EventType.GET_AUDIT_REPORTS;
  metadata: {
    projectId: string;
  };
}

interface GetAuditReportEvent {
  type: EventType.GET_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    projectId: string;
  };
}

interface DeleteAuditReportEvent {
  type: EventType.DELETE_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    projectId: string;
  };
}

// Org-scoped report events carry no org id in metadata: the audit log row itself is org-scoped.
interface CreateOrgAuditReportEvent {
  type: EventType.CREATE_ORG_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
    reportTypes: string[];
    recipientCount: number;
  };
}

interface GetOrgAuditReportsEvent {
  type: EventType.GET_ORG_AUDIT_REPORTS;
  metadata: {
    offset: number;
    limit: number;
  };
}

interface DeleteOrgAuditReportEvent {
  type: EventType.DELETE_ORG_AUDIT_REPORT;
  metadata: {
    auditReportId: string;
  };
}

interface ViewAuditLogsEvent {
  type: EventType.VIEW_AUDIT_LOGS;
  metadata?: Record<string, unknown>;
}

interface PermissionDeniedEvent {
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

interface UpdateAuditLogSettingsEvent {
  type: EventType.UPDATE_AUDIT_LOG_SETTINGS;
  metadata: {
    scope: "organization" | "project";
    eventClasses?: { eventClass: string; isEnabled: boolean }[];
    auditLogsRetentionDays?: number;
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

interface ProjectRoleListEvent {
  type: EventType.LIST_PROJECT_ROLES;
  metadata: {
    projectId: string;
  };
}

interface ProjectRoleGetEvent {
  type: EventType.GET_PROJECT_ROLE;
  metadata: {
    projectId: string;
    slug: string;
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

interface PamSessionStartEvent {
  type: EventType.PAM_SESSION_START;
  metadata: {
    sessionId: string;
    accountId?: string;
    accountName: string;
  };
}

interface PamSessionEndEvent {
  type: EventType.PAM_SESSION_END;
  metadata: {
    sessionId: string;
    accountId?: string;
    accountName: string;
  };
}

interface PamSessionTerminateEvent {
  type: EventType.PAM_SESSION_TERMINATE;
  metadata: {
    sessionId: string;
    accountId?: string;
    accountName: string;
  };
}

interface PamSessionChunkUploadEvent {
  type: EventType.PAM_SESSION_CHUNK_UPLOAD;
  metadata: {
    sessionId: string;
    accountId?: string;
    chunkIndex: number;
    storageBackend: string;
    ciphertextBytes: number;
  };
}

interface PamSessionUploadTokenInvalidEvent {
  type: EventType.PAM_SESSION_UPLOAD_TOKEN_INVALID;
  metadata: {
    sessionId: string;
    accountId?: string;
    chunkIndex?: number;
  };
}

interface PamAccountTemplateCreateEvent {
  type: EventType.PAM_ACCOUNT_TEMPLATE_CREATE;
  metadata: {
    templateId: string;
    name: string;
    accountType: string;
  };
}

interface PamAccountTemplateUpdateEvent {
  type: EventType.PAM_ACCOUNT_TEMPLATE_UPDATE;
  metadata: {
    templateId: string;
    name?: string;
  };
}

interface PamAccountTemplateDeleteEvent {
  type: EventType.PAM_ACCOUNT_TEMPLATE_DELETE;
  metadata: {
    templateId: string;
    name: string;
  };
}

interface PamFolderCreateEvent {
  type: EventType.PAM_FOLDER_CREATE;
  metadata: {
    folderId: string;
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

interface OrgAdminAccessPamFolderEvent {
  type: EventType.ORG_ADMIN_ACCESS_PAM_FOLDER;
  metadata: {
    folderId: string;
    folderName: string;
    // The role the admin held on the folder before granting themselves admin, or null if they held none.
    previousRole: string | null;
  };
}

interface PamProductMemberAddEvent {
  type: EventType.PAM_PRODUCT_MEMBER_ADD;
  metadata: {
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

interface PamProductMemberUpdateEvent {
  type: EventType.PAM_PRODUCT_MEMBER_UPDATE;
  metadata: {
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

interface PamProductMemberRemoveEvent {
  type: EventType.PAM_PRODUCT_MEMBER_REMOVE;
  metadata: {
    userId?: string;
    groupId?: string;
    identityId?: string;
  };
}

interface PamFolderMemberAddEvent {
  type: EventType.PAM_FOLDER_MEMBER_ADD;
  metadata: {
    folderId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

interface PamFolderMemberUpdateEvent {
  type: EventType.PAM_FOLDER_MEMBER_UPDATE;
  metadata: {
    folderId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

interface PamFolderMemberRemoveEvent {
  type: EventType.PAM_FOLDER_MEMBER_REMOVE;
  metadata: {
    folderId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
  };
}

interface PamAccountMemberAddEvent {
  type: EventType.PAM_ACCOUNT_MEMBER_ADD;
  metadata: {
    accountId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

interface PamAccountMemberUpdateEvent {
  type: EventType.PAM_ACCOUNT_MEMBER_UPDATE;
  metadata: {
    accountId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
    role: string;
  };
}

interface PamAccountMemberRemoveEvent {
  type: EventType.PAM_ACCOUNT_MEMBER_REMOVE;
  metadata: {
    accountId: string;
    userId?: string;
    groupId?: string;
    identityId?: string;
  };
}

interface PamAccountAccessEvent {
  type: EventType.PAM_ACCOUNT_ACCESS;
  metadata: {
    accountId: string;
    resourceName: string;
    accountName: string;
    duration?: string;
    reason?: string;
  };
}

interface PamWebAccessSessionTicketCreatedEvent {
  type: EventType.PAM_WEB_ACCESS_SESSION_TICKET_CREATED;
  metadata: {
    accountId: string;
    resourceName: string;
    accountName: string;
  };
}

interface AgentVaultProxyRegisterEvent {
  type: EventType.AGENT_VAULT_PROXY_REGISTER;
  metadata: {
    proxyId: string;
    name: string;
    description: string | null;
  };
}

interface AgentVaultProxyTokenReissueEvent {
  type: EventType.AGENT_VAULT_PROXY_TOKEN_REISSUE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

interface AgentVaultProxyTokenRotateEvent {
  type: EventType.AGENT_VAULT_PROXY_TOKEN_ROTATE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

interface AgentVaultProxyEnrollEvent {
  type: EventType.AGENT_VAULT_PROXY_ENROLL;
  metadata: {
    proxyId: string;
    name: string;
    rootCaFingerprint: string;
    replacedExistingCa: boolean;
  };
}

interface AgentVaultProxyUpdateEvent {
  type: EventType.AGENT_VAULT_PROXY_UPDATE;
  metadata: {
    proxyId: string;
    name: string;
    description?: string | null;
    trafficPolicy?: string;
    allowedHosts?: string | null;
    pollInterval?: number;
  };
}

interface AgentVaultProxyRevokeEvent {
  type: EventType.AGENT_VAULT_PROXY_REVOKE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

interface AgentVaultProxyDeleteEvent {
  type: EventType.AGENT_VAULT_PROXY_DELETE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

interface AgentVaultSessionLogSettingsUpdateEvent {
  type: EventType.AGENT_VAULT_SESSION_LOG_SETTINGS_UPDATE;
  metadata: {
    enabled: boolean;
    // Null when session logs are off.
    storageType: ObjectStorageType | null;
    appConnectionId: string | null;
    appConnectionName: string | null;
    bucket: string | null;
    region: string | null;
    keyPrefix: string | null;
    // The storage that was recording before this change, when it changed the storage or turned session logs off.
    previousStorageType?: ObjectStorageType | null;
    previousAppConnectionId?: string | null;
    previousAppConnectionName?: string | null;
    previousBucket?: string | null;
    previousRegion?: string | null;
    previousKeyPrefix?: string | null;
  };
}

interface AgentVaultAccessBundleCreateEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_CREATE;
  metadata: {
    accessBundleId: string;
    name: string;
    description?: string | null;
  };
}

interface AgentVaultAccessBundleUpdateEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_UPDATE;
  metadata: {
    accessBundleId: string;
    name: string;
    description?: string | null;
  };
}

interface AgentVaultAccessBundleDeleteEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_DELETE;
  metadata: {
    accessBundleId: string;
    name: string;
  };
}

// A service's hook: the saved hook by ID and name, and what it checks of the service. No narrowing means every request,
// or every connection for a database or SSH service.
type TAgentVaultServiceHookAudit = {
  id: string;
  name: string;
  methods?: string[];
  paths?: string[];
  tools?: string[];
};

interface AgentVaultServiceCreateEvent {
  type: EventType.AGENT_VAULT_SERVICE_CREATE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    // The access bundles the service was in. Absent on events recorded before services moved to the project.
    accessBundles?: { id: string; name: string }[];
    serviceId: string;
    name: string;
    description?: string | null;
    serviceType: string;
    // MCP services only.
    serverUrl?: string;
    transport?: string;
    // Database and SSH services only. A host pattern is never set on those, so they report these instead.
    host?: string;
    port?: number;
    database?: string;
    tlsEnabled?: boolean;
    tlsVerify?: boolean;
    // Whether the proxy checks the server's certificate against a CA stored on the service rather than the system's.
    hasTlsCa?: boolean;
    // Absent for a database or SSH service.
    hostPattern?: string;
    credentialType: string;
    // OAuth credentials only. A service that sends an OAuth variable's sign-in names the variable instead.
    oauthIssuer?: string;
    oauthScopes?: string[];
    oauthVariable?: { id: string; key: string };
    headerName?: string;
    headerPrefix?: string;
    allowedMethods?: string[] | null;
    allowedPathPrefixes?: string[] | null;
    allowedTools?: string[] | null;
    // The fields each member sets for themselves, such as credential-value or credential-username.
    memberProvidedFields?: string[];
    // Names and placeholders only. A sealed value must never reach an audit row.
    customHeaderNames?: string[];
    substitutionPlaceholders?: string[];
    variableKeys?: string[];
    // The saved hook the service was created with and what it checks of the service; no narrowing means every request.
    hook?: TAgentVaultServiceHookAudit;
    // Present only on events recorded before hooks became their own resource.
    hookUrl?: string;
  };
}

interface AgentVaultServiceUpdateEvent {
  type: EventType.AGENT_VAULT_SERVICE_UPDATE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    serviceId: string;
    // The service's name after the update. Absent on events recorded before it was added; `name` is set only by a rename.
    serviceName?: string;
    name?: string;
    // Null when the update removed it.
    description?: string | null;
    // The service's type, which never changes, so present on every update.
    serviceType: string;
    serverUrl?: string;
    transport?: string;
    // Database and SSH services only. A host pattern is never set on those, so they report these instead.
    host?: string;
    port?: number;
    database?: string;
    tlsEnabled?: boolean;
    tlsVerify?: boolean;
    // Present only when the update changed the stored CA the proxy checks the server's certificate against.
    tlsCaChanged?: "set" | "removed" | "replaced";
    // Present only when the update set, changed or removed the service's hook. `hook` is the hook afterwards, null when
    // removed, and `previousHook` the one before, null when there was none.
    hookChanged?: "set" | "removed" | "updated";
    hook?: TAgentVaultServiceHookAudit | null;
    previousHook?: TAgentVaultServiceHookAudit | null;
    // Present only on events recorded before hooks became their own resource.
    hookUrl?: string;
    hookSecretReplaced?: boolean;
    hostPattern?: string;
    credentialType?: string;
    // Present when the update connected or reauthorized an OAuth credential, or the variable when it chose an OAuth
    // variable.
    oauthIssuer?: string;
    oauthScopes?: string[];
    oauthVariable?: { id: string; key: string };
    headerName?: string;
    headerPrefix?: string;
    allowedMethods?: string[] | null;
    allowedPathPrefixes?: string[] | null;
    allowedTools?: string[] | null;
    // The fields each member sets for themselves after the update, present when it touched the credential.
    memberProvidedFields?: string[];
    customHeaderNames?: string[];
    customHeadersReplaced?: string[];
    substitutionPlaceholders?: string[];
    substitutionsReplaced?: string[];
    credentialReplaced: boolean;
    // Whether the update deleted what members saved for the service: their typed values or their OAuth connections.
    personalValuesCleared?: boolean;
    // Every key the service uses after the update, present when the update wrote a value that can hold one.
    variableKeys?: string[];
  };
}

interface AgentVaultServiceDeleteEvent {
  type: EventType.AGENT_VAULT_SERVICE_DELETE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    // The access bundles the service was in. Absent on events recorded before services moved to the project.
    accessBundles?: { id: string; name: string }[];
    serviceId: string;
    name: string;
  };
}

// Keys only. A variable's value never reaches an audit row. Variables belonged to an access bundle until they moved to
// Agent Vault as a whole, so accessBundleId and accessBundleName are present only on events recorded before that.
interface AgentVaultVariableCreateEvent {
  type: EventType.AGENT_VAULT_VARIABLE_CREATE;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
    // text or oauth. Absent on events from before OAuth variables.
    type?: string;
    // OAuth variables only: where its sign-in goes. Never a token.
    oauthIssuer?: string;
    oauthTokenEndpoint?: string;
    oauthScopes?: string[];
  };
}

interface AgentVaultVariableUpdateEvent {
  type: EventType.AGENT_VAULT_VARIABLE_UPDATE;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
    // text or oauth. Absent on events from before OAuth variables.
    type?: string;
    // OAuth variables only: where its sign-in goes. Never a token.
    oauthIssuer?: string;
    oauthTokenEndpoint?: string;
    oauthScopes?: string[];
    // Present only when the update changed the key.
    previousKey?: string;
    // For an OAuth variable: whether its tokens were replaced by an import or removed by a disconnect.
    valueReplaced: boolean;
  };
}

interface AgentVaultVariableDeleteEvent {
  type: EventType.AGENT_VAULT_VARIABLE_DELETE;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
    // text or oauth. Absent on events from before OAuth variables.
    type?: string;
    // OAuth variables only: where its sign-in goes. Never a token.
    oauthIssuer?: string;
    oauthTokenEndpoint?: string;
    oauthScopes?: string[];
  };
}

// An OAuth variable that got tokens: a sign-in (`sign-in` the first time, `reconnect` when it replaced tokens) or tokens
// an API caller imported (`import`). Recorded only on success, and never with a token.
interface AgentVaultOauthVariableConnectEvent {
  type: EventType.AGENT_VAULT_OAUTH_VARIABLE_CONNECT;
  metadata: {
    variableId: string;
    key: string;
    method: "sign-in" | "reconnect" | "import";
    oauthIssuer: string;
    oauthScopes: string[];
  };
}

interface AgentVaultVariableValueViewEvent {
  type: EventType.AGENT_VAULT_VARIABLE_VALUE_VIEW;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
  };
}

// The personal values the actor set for a service that leaves some fields to each member. Field names only, never a value.
interface AgentVaultPersonalValuesSetEvent {
  type: EventType.AGENT_VAULT_PERSONAL_VALUES_SET;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    serviceId: string;
    serviceName: string;
    // Which credential the fields belong to: credential-value is a token for bearer and a password for basic.
    credentialType: string;
    // The fields this update set. A field it left out kept its saved value.
    fields: string[];
    variableKeys: string[];
    // Set when the member connected their own OAuth account.
    oauthIssuer?: string;
    oauthScopes?: string[];
  };
}

interface AgentVaultPersonalValuesDeleteEvent {
  type: EventType.AGENT_VAULT_PERSONAL_VALUES_DELETE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    serviceId: string;
    serviceName: string;
    credentialType: string;
  };
}

interface AgentVaultSkillCreateEvent {
  type: EventType.AGENT_VAULT_SKILL_CREATE;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
    sha256: string;
  };
}

interface AgentVaultSkillVersionCreateEvent {
  type: EventType.AGENT_VAULT_SKILL_VERSION_CREATE;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
    sha256: string;
  };
}

interface AgentVaultSkillRenameEvent {
  type: EventType.AGENT_VAULT_SKILL_RENAME;
  metadata: {
    skillId: string;
    oldName: string;
    newName: string;
  };
}

interface AgentVaultSkillVersionRestoreEvent {
  type: EventType.AGENT_VAULT_SKILL_VERSION_RESTORE;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
    restoredFromVersion: number;
    sha256: string;
  };
}

interface AgentVaultSkillVersionViewEvent {
  type: EventType.AGENT_VAULT_SKILL_VERSION_VIEW;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
  };
}

interface AgentVaultSkillDeleteEvent {
  type: EventType.AGENT_VAULT_SKILL_DELETE;
  metadata: {
    skillId: string;
    skillName: string;
    // The access bundles the skill was in when it was deleted.
    removedFromBundles: { id: string; name: string }[];
  };
}

interface AgentVaultHookCreateEvent {
  type: EventType.AGENT_VAULT_HOOK_CREATE;
  metadata: {
    hookId: string;
    hookName: string;
    url: string;
  };
}

interface AgentVaultHookUpdateEvent {
  type: EventType.AGENT_VAULT_HOOK_UPDATE;
  metadata: {
    hookId: string;
    // The hook's name after the update; `name` is set only by a rename.
    hookName: string;
    name?: string;
    // Null when the update removed it.
    description?: string | null;
    url?: string;
    // Whether a new secret was saved. The secret itself is never recorded.
    secretReplaced: boolean;
  };
}

interface AgentVaultHookDeleteEvent {
  type: EventType.AGENT_VAULT_HOOK_DELETE;
  metadata: {
    hookId: string;
    hookName: string;
    url: string;
    // The project's services that used the hook and are no longer checked by it.
    services: { id: string; name: string }[];
  };
}

interface AgentVaultAccessBundleSkillAddEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_ADD;
  metadata: {
    skillId: string;
    skillName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

interface AgentVaultAccessBundleSkillRemoveEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_REMOVE;
  metadata: {
    skillId: string;
    skillName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

interface AgentVaultAccessBundleServiceAddEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SERVICE_ADD;
  metadata: {
    serviceId: string;
    serviceName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

// The service stays in the project. Personal values of members who reached it only through this bundle are deleted.
interface AgentVaultAccessBundleServiceRemoveEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SERVICE_REMOVE;
  metadata: {
    serviceId: string;
    serviceName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

// Recorded once per fetch when the CLI gets a session's skills at agent start, not when the agent reads them.
interface AgentVaultSkillsDeliveredEvent {
  type: EventType.AGENT_VAULT_SKILLS_DELIVERED;
  metadata: {
    sessionId: string;
    // The session's access bundle, when any skill delivered came through it.
    accessBundleId: string | null;
    accessBundleName: string | null;
    skills: {
      skillId: string;
      skillName: string;
      version: number;
      sha256: string;
      // Null for a skill the session lists by name or was sent with, rather than one it got through its access bundle.
      accessBundleId: string | null;
      accessBundleName: string | null;
      isInline: boolean;
    }[];
    // Set when the machine identity in the actor started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

interface AgentVaultProductMemberAddEvent {
  type: EventType.AGENT_VAULT_MEMBER_ADD;
  metadata: {
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
    role: string;
  };
}

interface AgentVaultProductMemberUpdateEvent {
  type: EventType.AGENT_VAULT_MEMBER_UPDATE;
  metadata: {
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
    role: string;
  };
}

interface AgentVaultProductMemberRemoveEvent {
  type: EventType.AGENT_VAULT_MEMBER_REMOVE;
  metadata: {
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
  };
}

interface AgentVaultAccessBundleMemberAddEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_ADD;
  metadata: {
    accessBundleId: string;
    accessBundleName: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
  };
}

interface AgentVaultAccessBundleMemberRemoveEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_REMOVE;
  metadata: {
    accessBundleId: string;
    accessBundleName: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
  };
}

interface AgentVaultSessionMintEvent {
  type: EventType.AGENT_VAULT_SESSION_MINT;
  metadata: {
    sessionId: string;
    label: string | null;
    // The session's own key/value metadata. Set when the session was created with some.
    metadata?: Record<string, string>;
    // Null for a session started without an access bundle.
    accessBundleId: string | null;
    accessBundleName: string | null;
    expiresAt: string | null;
    // Set when the session has skills besides its access bundle's, in the order they were sent, the same way as the
    // API's. One sent inline also carries the hash and size of its files, never the files.
    skills?: (
      | { skillId: string; name: string; isInline: false }
      | {
          skillId: string;
          name: string;
          isInline: true;
          description: string;
          sha256: string;
          sizeBytes: number;
          fileCount: number;
        }
    )[];
    // Set when the session has services besides its access bundle's, in the order they were sent, the same way as the
    // API's. One an admin sent inline also carries what it was sent with, never its values.
    services?: (
      | { serviceId: string; name: string; isInline: false }
      | {
          serviceId: string;
          // The name it was sent with, or its first host when it was sent without one.
          name: string;
          isInline: true;
          description?: string | null;
          serviceType: string;
          serverUrl?: string;
          transport?: string;
          // Absent for a database or SSH service, which reports host, port and database instead.
          hostPattern?: string;
          host?: string;
          port?: number;
          database?: string;
          tlsEnabled?: boolean;
          tlsVerify?: boolean;
          // Whether the proxy checks the server's certificate against a CA sent with the service rather than the system's.
          hasTlsCa?: boolean;
          credentialType: string;
          headerName?: string;
          // OAuth only: the OAuth variable whose sign-in the service sends, or the issuer of tokens sent with the session.
          oauthVariable?: { id: string; key: string };
          oauthIssuer?: string;
          allowedMethods: string[] | null;
          allowedPathPrefixes: string[] | null;
          // Absent for every type but MCP. Null when the agent can call every tool.
          allowedTools?: string[] | null;
          customHeaderNames: string[];
          substitutionPlaceholders: string[];
          // The saved hook the service was sent with and what it checks of the service.
          hook?: TAgentVaultServiceHookAudit;
          // Present only on events recorded before hooks became their own resource.
          hookUrl?: string;
        }
    )[];
    // Set when a machine identity started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

interface AgentVaultSessionUpdateEvent {
  type: EventType.AGENT_VAULT_SESSION_UPDATE;
  metadata: {
    sessionId: string;
    label: string | null;
    previousLabel: string | null;
    // The session's own key/value metadata after the update.
    metadata?: Record<string, string>;
    sessionOwner: string;
    accessBundleName: string | null;
    // Set when the machine identity in sessionOwner started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

interface AgentVaultSessionRevokeEvent {
  type: EventType.AGENT_VAULT_SESSION_REVOKE;
  metadata: {
    sessionId: string;
    label: string | null;
    sessionOwner: string;
    accessBundleName: string | null;
    // Set when the session was ended with its own token rather than by a signed-in user or identity.
    revokedWithToken?: boolean;
    // Set when the machine identity in sessionOwner started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

interface AgentVaultDelegationSetEvent {
  type: EventType.AGENT_VAULT_DELEGATION_SET;
  metadata: {
    machineIdentityId: string;
    machineIdentityName: string;
    scope: string;
    users: { userId: string; userName: string }[];
    groups: { groupId: string; groupName: string }[];
  };
}

interface AgentVaultDelegationDeleteEvent {
  type: EventType.AGENT_VAULT_DELEGATION_DELETE;
  metadata: {
    machineIdentityId: string;
    machineIdentityName: string;
    scope: string;
    users: { userId: string; userName: string }[];
    groups: { groupId: string; groupName: string }[];
  };
}

interface PamAccountCreateEvent {
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

interface PamAccountUpdateEvent {
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

interface PamAccountDeleteEvent {
  type: EventType.PAM_ACCOUNT_DELETE;
  metadata: {
    accountId: string;
    accountType: string;
    accountName: string;
  };
}

interface PamAccountSshCaCreateEvent {
  type: EventType.PAM_ACCOUNT_SSH_CA_CREATE;
  metadata: {
    accountId: string;
    keyAlgorithm: string;
  };
}

interface PamAccountCredentialsViewEvent {
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

interface PamDiscoverySourceCreateEvent {
  type: EventType.PAM_DISCOVERY_SOURCE_CREATE;
  metadata: { sourceId: string; discoveryType: string; name: string };
}

interface PamDiscoverySourceUpdateEvent {
  type: EventType.PAM_DISCOVERY_SOURCE_UPDATE;
  metadata: { sourceId: string; discoveryType: string };
}

interface PamDiscoverySourceDeleteEvent {
  type: EventType.PAM_DISCOVERY_SOURCE_DELETE;
  metadata: { sourceId: string; discoveryType: string };
}

interface PamDiscoveryScanEvent {
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

interface PamDiscoveredAccountImportEvent {
  type: EventType.PAM_DISCOVERED_ACCOUNT_IMPORT;
  metadata: {
    sourceId: string;
    folderId: string;
    importedCount: number;
    importedAccounts: { discoveredAccountId: string; accountId?: string; name?: string }[];
  };
}

interface PamAccountHeartbeatEvent {
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

interface PamAccountRotateCredentialsEvent {
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

interface PamAccountSetRotationAccountEvent {
  type: EventType.PAM_ACCOUNT_SET_ROTATION_ACCOUNT;
  metadata: {
    accountId: string;
    accountName: string;
    rotationAccountId: string | null;
    rotationAccountName: string | null;
  };
}

interface PamAccessRequestCreateEvent {
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

interface PamAccessRequestReviewEvent {
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

interface PamAccessGrantRevokeEvent {
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

interface PamApprovalConfigUpdateEvent {
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

interface UpdateCertificateRenewalConfigEvent {
  type: EventType.UPDATE_CERTIFICATE_RENEWAL_CONFIG;
  metadata: {
    certificateId: string;
    renewBeforeDays: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
  };
}

interface UpdateCertificateMetadataEvent {
  type: EventType.UPDATE_CERTIFICATE_METADATA;
  metadata: {
    certificateId: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
    metadata: { key: string; value: string }[];
  };
}

interface UpdateCertificateCleanupConfigEvent {
  type: EventType.UPDATE_CERTIFICATE_CLEANUP_CONFIG;
  metadata: {
    projectId: string;
    isEnabled: boolean;
    postExpiryRetentionDays: number;
    skipCertsWithActiveSyncs: boolean;
  };
}

interface CertificateCleanupCompletedEvent {
  type: EventType.CERTIFICATE_CLEANUP_COMPLETED;
  metadata: {
    deletedCount: number;
    certificateSerialNumbers: string[];
  };
}

interface DisableCertificateRenewalConfigEvent {
  type: EventType.DISABLE_CERTIFICATE_RENEWAL_CONFIG;
  metadata: {
    certificateId: string;
    commonName: string;
    applicationId?: string | null;
    applicationName?: string | null;
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
    applicationId?: string | null;
    applicationName?: string | null;
    commonName?: string;
    status?: string;
    serialNumber?: string;
  };
}

interface GetCertificateFromRequestEvent {
  type: EventType.GET_CERTIFICATE_FROM_REQUEST;
  metadata: {
    certificateRequestId: string;
    certificateId?: string;
  };
}

interface TriggerCertificateRequestValidationEvent {
  type: EventType.TRIGGER_CERTIFICATE_REQUEST_VALIDATION;
  metadata: {
    certificateRequestId: string;
    applicationId?: string | null;
    applicationName?: string | null;
    status: string;
    orderStatus?: string;
  };
}

interface CancelCertificateRequestEvent {
  type: EventType.CANCEL_CERTIFICATE_REQUEST;
  metadata: {
    certificateRequestId: string;
    applicationId?: string | null;
    applicationName?: string | null;
    commonName?: string;
    cancelled: boolean;
    previousStatus: string;
    previousPendingMessage: string | null;
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
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    status: string;
  } & TApprovalRequestSubjectMetadata;
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
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    justification?: string;
    requestDuration: string;
  } & TApprovalRequestSubjectMetadata;
}

interface ApprovalRequestApproveEvent {
  type: EventType.APPROVAL_REQUEST_APPROVE;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    comment?: string;
  } & TApprovalRequestSubjectMetadata;
}

// The rule that approved the request and what it checked, so an admin can see why access was granted
type TAutoApprovalAuditMetadata = {
  ruleId: string | null;
  ruleName?: string;
  linkedRecords: { label: string; value: string }[];
  conditions: string[];
};

interface ApprovalRequestAutoApproveEvent {
  type: EventType.APPROVAL_REQUEST_AUTO_APPROVE;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
  } & TAutoApprovalAuditMetadata &
    TApprovalRequestSubjectMetadata;
}

interface ApprovalRequestRejectEvent {
  type: EventType.APPROVAL_REQUEST_REJECT;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    comment?: string;
  } & TApprovalRequestSubjectMetadata;
}

interface ApprovalRequestCancelEvent {
  type: EventType.APPROVAL_REQUEST_CANCEL;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    // Set when Infisical cancelled the request rather than its requester.
    reason?: string;
  } & TApprovalRequestSubjectMetadata;
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

interface PamAccessPolicyBypassedEvent {
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

interface PamAccessRequestAutoApprovedEvent {
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

interface AccessApprovalRequestCreateEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_CREATE;
  metadata: {
    requestId: string;
    policyId: string;
    isTemporary: boolean;
    temporaryRange?: string;
    permissions: unknown;
    note?: string;
  };
}

interface AccessApprovalRequestReviewEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_REVIEW;
  metadata: {
    requestId: string;
    policyId: string;
    reviewStatus: string;
    isBypass?: boolean;
    bypassReason?: string;
  };
}

interface AccessApprovalRequestRevokeEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_REVOKE;
  metadata: {
    requestId: string;
    requestedByUserId: string;
    policyId: string;
  };
}

interface AccessApprovalRequestDelegatedDispatchRetryEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_DELEGATED_DISPATCH_RETRY;
  metadata: {
    requestId: string;
    requestedByUserId: string;
    requestedByUserName: string;
    requestedByUserEmail: string;
    policyId: string;
    policyName: string;
    environment: string;
    secretPath: string;
    delegatedApprovalType: string;
  };
}

interface AccessApprovalRequestDelegatedDecisionEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_DELEGATED_DECISION;
  metadata: {
    requestId: string;
    policyId: string;
    policyName?: string;
    delegatedApprovalType: string;
    delegatedProviderRequestId: string;
    providerRecordNumber?: string;
    permissions?: string[];
    outcome: string;
    decision?: string;
    approvedBy?: string[];
    decidedAt?: string;
    decisionNotes?: string;
    reason?: string;
  };
}

interface AccessApprovalRequestCancelEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_CANCEL;
  metadata: {
    requestId: string;
    requestedByUserId: string;
    requestedByUserName: string;
    requestedByUserEmail: string;
    policyId: string;
    policyName: string;
    environment: string;
    secretPath: string;
  };
}

interface AccessApprovalRequestUpdateEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_UPDATE;
  metadata: {
    requestId: string;
    policyId: string;
    temporaryRange: string;
    editNote: string;
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
      wildcard?: boolean;
    }>;
  };
}

interface FinalizeAcmeOrderEvent {
  type: EventType.FINALIZE_ACME_ORDER;
  metadata: {
    orderId: string;
    commonName: string;
    csr: string;
  };
}

interface DownloadAcmeCertificateEvent {
  type: EventType.DOWNLOAD_ACME_CERTIFICATE;
  metadata: {
    orderId: string;
    certificateId: string;
    commonName: string;
    serialNumber: string;
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

interface CreateProxiedServiceEvent {
  type: EventType.CREATE_PROXIED_SERVICE;
  metadata: {
    proxiedServiceId: string;
    name: string;
    hostPattern: string;
    // secret / dynamic secret names only; never placeholder/secret/lease values
    secretKeys: string[];
    dynamicSecretNames: string[];
    environment: string;
    secretPath: string;
  };
}

interface UpdateProxiedServiceEvent {
  type: EventType.UPDATE_PROXIED_SERVICE;
  metadata: {
    proxiedServiceId: string;
    name: string;
    hostPattern: string;
    updatedFields: string[];
    secretKeys: string[];
    dynamicSecretNames: string[];
    environment: string;
    secretPath: string;
  };
}

interface DeleteProxiedServiceEvent {
  type: EventType.DELETE_PROXIED_SERVICE;
  metadata: {
    proxiedServiceId: string;
    name: string;
    environment: string;
    secretPath: string;
  };
}

interface SignAgentProxyIntermediateCaEvent {
  type: EventType.SIGN_AGENT_PROXY_INTERMEDIATE_CA;
  metadata: {
    serialNumber: string;
    expiration: string;
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

interface ScepEnrollmentEvent {
  type: EventType.SCEP_ENROLLMENT;
  metadata: {
    profileId: string;
    profileSlug: string;
    transactionId: string;
    csrSubject: string;
    challengeType: ScepChallengeType;
    status: ScepEnrollmentStatus;
    failReason?: string;
    issuedCertificateId?: string;
    issuedSerialNumber?: string;
    clientIp: string;
  };
}

interface ScepRenewalEvent {
  type: EventType.SCEP_RENEWAL;
  metadata: {
    profileId: string;
    profileSlug: string;
    transactionId: string;
    csrSubject: string;
    existingCertificateSerial?: string;
    existingCertificateSubject?: string;
    status: ScepEnrollmentStatus;
    failReason?: string;
    issuedCertificateId?: string;
    issuedSerialNumber?: string;
    clientIp: string;
  };
}

interface MicrosoftAutoenrollmentIssuanceEvent {
  type: EventType.MICROSOFT_AUTOENROLLMENT_ISSUANCE | EventType.MICROSOFT_AUTOENROLLMENT_RENEWAL;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileId: string;
    profileName: string;
    computerName: string;
    computerSid: string;
    dnsHostName: string;
    result: MicrosoftAutoenrollmentIssuanceResult;
    certificateId?: string;
    serialNumber?: string;
    certificateRequestId: string;
    requestNumber: string;
  };
}

interface MicrosoftAutoenrollmentRequestRefusedEvent {
  type: EventType.MICROSOFT_AUTOENROLLMENT_REQUEST_REFUSED;
  metadata: {
    applicationId: string;
    applicationName?: string;
    profileId: string;
    profileName: string;
    reason: KerberosFailureReason | MicrosoftAutoenrollmentFailureReason;
    computerName?: string;
    ticketServiceName?: string;
    ticketKeyVersion?: number;
    message?: string;
  } & TAuditLogCollapseSummary;
}

interface ScepDynamicChallengeGeneratedEvent {
  type: EventType.SCEP_DYNAMIC_CHALLENGE_GENERATED;
  metadata: {
    profileId: string;
    profileSlug: string;
    expiresAt: string;
    applicationId?: string;
    applicationName?: string;
  };
}

interface SecretValidationRuleCreateEvent {
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

interface SecretValidationRuleUpdateEvent {
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

interface SecretValidationRuleDeleteEvent {
  type: EventType.SECRET_VALIDATION_RULE_DELETE;
  metadata: {
    ruleId: string;
    name: string;
    type: string;
  };
}

interface ExternalMigrationCreateEvent {
  type: EventType.EXTERNAL_MIGRATION_CREATE;
  metadata: {
    configId: string;
    provider: string;
    connectionId: string | null;
  };
}

interface ExternalMigrationUpdateEvent {
  type: EventType.EXTERNAL_MIGRATION_UPDATE;
  metadata: {
    configId: string;
    provider: string;
    connectionId: string | null;
  };
}

interface ExternalMigrationDeleteEvent {
  type: EventType.EXTERNAL_MIGRATION_DELETE;
  metadata: {
    configId: string;
    provider: string;
  };
}

interface ImportVaultSecretsEvent {
  type: EventType.IMPORT_VAULT_SECRETS;
  metadata: {
    environment: string;
    secretPath: string;
    vaultNamespace: string;
    mountPath: string;
    vaultSecretPaths: string[];
    connectionId: string;
    keepVaultStructure: boolean;
    status: ExternalMigrationImportStatus;
    importedSecretCount: number;
    approvalRequiredSecretCount: number;
    importedPaths?: string[];
    approvalRequiredPaths?: string[];
  };
}
interface CreateOauthClientEvent {
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

interface UpdateOauthClientEvent {
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

interface DeleteOauthClientEvent {
  type: EventType.DELETE_OAUTH_CLIENT;
  metadata: {
    clientDbId: string;
    clientId: string;
    name: string;
  };
}

interface RotateOauthClientSecretEvent {
  type: EventType.ROTATE_OAUTH_CLIENT_SECRET;
  metadata: {
    clientDbId: string;
    clientId: string;
    name: string;
  };
}

interface OauthClientAuthorizeEvent {
  type: EventType.OAUTH_CLIENT_AUTHORIZE;
  metadata: {
    clientId: string;
    clientName: string;
    scopes: string[];
    resource?: string;
  };
}

interface OauthClientTokenExchangeEvent {
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

interface IssueOidcTokenEvent {
  type: EventType.ISSUE_OIDC_TOKEN;
  metadata: {
    connectionId: string;
    connectionName: string;
    audience: string;
  };
}

interface CreateEmailDomainEvent {
  type: EventType.CREATE_EMAIL_DOMAIN;
  metadata: {
    emailDomainId: string;
    domain: string;
  };
}

interface VerifyEmailDomainEvent {
  type: EventType.VERIFY_EMAIL_DOMAIN;
  metadata: {
    emailDomainId: string;
    domain: string;
  };
}

interface DeleteEmailDomainEvent {
  type: EventType.DELETE_EMAIL_DOMAIN;
  metadata: {
    emailDomainId: string;
    domain: string;
  };
}

interface GatewayCreateEvent {
  type: EventType.GATEWAY_CREATE;
  metadata: {
    gatewayId: string;
    name: string;
  };
}

interface GatewayUpdateEvent {
  type: EventType.GATEWAY_UPDATE;
  metadata: {
    gatewayId: string;
    name: string;
    previousName: string;
  };
}

interface GatewayDeleteEvent {
  type: EventType.GATEWAY_DELETE;
  metadata: {
    gatewayId: string;
    name: string;
  };
}

interface GatewayEnrollmentTokenCreateEvent {
  type: EventType.GATEWAY_ENROLLMENT_TOKEN_CREATE;
  metadata: {
    tokenId: string;
    name: string;
  };
}

interface GatewayEnrollEvent {
  type: EventType.GATEWAY_ENROLL;
  metadata: {
    gatewayId: string;
    name: string;
  };
}

interface GatewayConnectEvent {
  type: EventType.GATEWAY_CONNECT;
  metadata: {
    gatewayId: string;
    name: string;
    transports: GatewayTransport[];
    directAddress?: string;
    relayName?: string;
  };
}

type ResourceAuthMethodKind = TSettableAuthMethod;
type ResourceAuthMethodResourceType = "gateway" | "relay" | "kmip";

interface ResourceAuthMethodLoginEvent {
  type: EventType.RESOURCE_AUTH_METHOD_LOGIN;
  metadata: {
    resourceType: ResourceAuthMethodResourceType;
    resourceId: string;
    resourceName?: string;
    method: ResourceAuthMethodKind;
    methodConfigId: string;
    principalArn?: string;
    accountId?: string;
    enrollmentTokenId?: string;
    kubernetesNamespace?: string;
    kubernetesServiceAccountName?: string;
    gcpServiceAccountEmail?: string;
    gcpProjectId?: string;
    gcpZone?: string;
  };
}

interface ResourceAuthMethodLoginFailedEvent {
  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED;
  metadata: {
    resourceType: ResourceAuthMethodResourceType;
    resourceId: string;
    resourceName?: string;
    method: ResourceAuthMethodKind;
    reasonCode: string;
    message: string;
    principalArn?: string;
    accountId?: string;
    kubernetesNamespace?: string;
    kubernetesServiceAccountName?: string;
    gcpServiceAccountEmail?: string;
    gcpProjectId?: string;
    gcpZone?: string;
  };
}

interface ResourceAuthMethodConfigMetadata {
  resourceType: ResourceAuthMethodResourceType;
  resourceId: string;
  resourceName?: string;
  method: ResourceAuthMethodType;
  methodConfigId: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  kubernetesHost?: string;
  allowedNamespaces?: string;
  allowedNames?: string;
  allowedAudience?: string;
  gcpAuthType?: string;
  allowedServiceAccounts?: string;
  allowedProjects?: string;
  allowedZones?: string;
}

interface ResourceAuthMethodCreateEvent {
  type: EventType.RESOURCE_AUTH_METHOD_CREATE;
  metadata: ResourceAuthMethodConfigMetadata;
}

interface ResourceAuthMethodUpdateEvent {
  type: EventType.RESOURCE_AUTH_METHOD_UPDATE;
  metadata: ResourceAuthMethodConfigMetadata;
}

interface ResourceAuthMethodRevokeEvent {
  type: EventType.RESOURCE_AUTH_METHOD_REVOKE;
  metadata: {
    resourceType: ResourceAuthMethodResourceType;
    resourceId: string;
    method: ResourceAuthMethodKind;
    resourceName: string;
  };
}

interface RelayCreateEvent {
  type: EventType.RELAY_CREATE;
  metadata: {
    relayId: string;
    name: string;
  };
}

interface RelayUpdateEvent {
  type: EventType.RELAY_UPDATE;
  metadata: {
    relayId: string;
    name: string;
    host: string;
  };
}

interface RelayDeleteEvent {
  type: EventType.RELAY_DELETE;
  metadata: {
    relayId: string;
    name: string;
  };
}

interface RelayEnrollmentTokenCreateEvent {
  type: EventType.RELAY_ENROLLMENT_TOKEN_CREATE;
  metadata: {
    tokenId: string;
    name: string;
  };
}

interface KmipServerCreateEvent {
  type: EventType.KMIP_SERVER_CREATE;
  metadata: {
    kmipServerId: string;
    name: string;
  };
}

interface KmipServerUpdateEvent {
  type: EventType.KMIP_SERVER_UPDATE;
  metadata: {
    kmipServerId: string;
    name: string;
  };
}

interface KmipServerDeleteEvent {
  type: EventType.KMIP_SERVER_DELETE;
  metadata: {
    kmipServerId: string;
    name: string;
  };
}

interface KmipServerEnrollmentTokenCreateEvent {
  type: EventType.KMIP_SERVER_ENROLLMENT_TOKEN_CREATE;
  metadata: {
    tokenId: string;
    name: string;
  };
}

interface GatewayPoolCreateEvent {
  type: EventType.GATEWAY_POOL_CREATE;
  metadata: {
    poolId: string;
    name: string;
  };
}

interface GatewayPoolUpdateEvent {
  type: EventType.GATEWAY_POOL_UPDATE;
  metadata: {
    poolId: string;
    name: string;
  };
}

interface GatewayPoolDeleteEvent {
  type: EventType.GATEWAY_POOL_DELETE;
  metadata: {
    poolId: string;
    name: string;
  };
}

interface GatewayPoolAddMemberEvent {
  type: EventType.GATEWAY_POOL_ADD_MEMBER;
  metadata: {
    poolId: string;
    poolName: string;
    gatewayId: string;
    gatewayName: string;
  };
}

interface GatewayPoolRemoveMemberEvent {
  type: EventType.GATEWAY_POOL_REMOVE_MEMBER;
  metadata: {
    poolId: string;
    poolName: string;
    gatewayId: string;
    gatewayName: string;
  };
}

interface CreateHoneyTokenEvent {
  type: EventType.CREATE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: HoneyTokenType;
    managedBy: HoneyTokenManagedBy;
    environment: string;
    secretPath: string;
  };
}

interface UpdateHoneyTokenEvent {
  type: EventType.UPDATE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: HoneyTokenType;
    environment: string;
    secretPath: string;
  };
}

interface RevokeHoneyTokenEvent {
  type: EventType.REVOKE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: HoneyTokenType;
    environment: string;
    secretPath: string;
  };
}

interface DeleteHoneyTokenEvent {
  type: EventType.DELETE_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: HoneyTokenType;
    environment: string;
    secretPath: string;
  };
}

interface TriggerHoneyTokenEvent {
  type: EventType.TRIGGER_HONEY_TOKEN;
  metadata: {
    honeyTokenId: string;
    name: string;
    type: HoneyTokenType;
    projectId: string;
    eventName: string;
    eventTime: string;
    sourceIp: string;
    awsRegion: string;
  };
}

interface CreateProjectFolderGrantEvent {
  type: EventType.CREATE_PROJECT_FOLDER_GRANT;
  metadata: {
    grantId: string;
    sourceProjectId: string;
    targetProjectId: string;
    environment: string;
    secretPath: string;
  };
}

interface DeleteProjectFolderGrantEvent {
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

interface CreateSecretFolderAccessEvent {
  type: EventType.CREATE_SECRET_FOLDER_ACCESS;
  metadata: SecretFolderAccessEventMetadata;
}

interface UpdateSecretFolderAccessEvent {
  type: EventType.UPDATE_SECRET_FOLDER_ACCESS;
  metadata: SecretFolderAccessEventMetadata;
}

interface DeleteSecretFolderAccessEvent {
  type: EventType.DELETE_SECRET_FOLDER_ACCESS;
  metadata: SecretFolderAccessEventMetadata;
}

interface CreateAlertEvent {
  type: EventType.CREATE_ALERT;
  metadata: {
    alertId: string;
    name: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    eventType: string;
  };
}

interface UpdateAlertEvent {
  type: EventType.UPDATE_ALERT;
  metadata: {
    alertId: string;
    name: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    eventType: string;
  };
}

interface DeleteAlertEvent {
  type: EventType.DELETE_ALERT;
  metadata: {
    alertId: string;
    name: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    eventType: string;
  };
}

type TAuditLogStreamEventMetadata = {
  logStreamId: string;
  provider: string;
  destinationHost: string;
  filters: { products?: string[]; pamSessionActivity?: { includeOutput: boolean } | null } | null;
};

interface CreateAuditLogStreamEvent {
  type: EventType.CREATE_AUDIT_LOG_STREAM;
  metadata: TAuditLogStreamEventMetadata;
}

interface UpdateAuditLogStreamEvent {
  type: EventType.UPDATE_AUDIT_LOG_STREAM;
  metadata: TAuditLogStreamEventMetadata;
}

interface DeleteAuditLogStreamEvent {
  type: EventType.DELETE_AUDIT_LOG_STREAM;
  metadata: { logStreamId: string; provider: string; destinationHost: string };
}

interface TestAlertChannelEvent {
  type: EventType.TEST_ALERT_CHANNEL;
  metadata: {
    channelId?: string;
    channelType: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    success: boolean;
    deliveredTo?: number;
    error?: string;
  };
}

export type Event =
  | CreateAlertEvent
  | UpdateAlertEvent
  | DeleteAlertEvent
  | TestAlertChannelEvent
  | CreateAuditLogStreamEvent
  | UpdateAuditLogStreamEvent
  | DeleteAuditLogStreamEvent
  | CreateSubOrganizationEvent
  | UpdateSubOrganizationEvent
  | DeleteSubOrganizationEvent
  | JoinSubOrganizationEvent
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
  | AddTrustedIPEvent
  | UpdateTrustedIPEvent
  | DeleteTrustedIPEvent
  | CreateServiceTokenEvent
  | DeleteServiceTokenEvent
  | CreateIdentityEvent
  | UpdateIdentityEvent
  | DeleteIdentityEvent
  | LoginIdentityUniversalAuthEvent
  | LoginIdentityUniversalAuthFailedEvent
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
  | LoginIdentityKubernetesAuthFailedEvent
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
  | LoginIdentityGcpAuthFailedEvent
  | AddIdentityGcpAuthEvent
  | DeleteIdentityGcpAuthEvent
  | UpdateIdentityGcpAuthEvent
  | GetIdentityGcpAuthEvent
  | LoginIdentityAwsAuthEvent
  | LoginIdentityAwsAuthFailedEvent
  | AddIdentityAwsAuthEvent
  | UpdateIdentityAwsAuthEvent
  | GetIdentityAwsAuthEvent
  | DeleteIdentityAwsAuthEvent
  | LoginIdentityAliCloudAuthEvent
  | LoginIdentityAliCloudAuthFailedEvent
  | AddIdentityAliCloudAuthEvent
  | UpdateIdentityAliCloudAuthEvent
  | GetIdentityAliCloudAuthEvent
  | DeleteIdentityAliCloudAuthEvent
  | LoginIdentityTlsCertAuthEvent
  | LoginIdentityTlsCertAuthFailedEvent
  | AddIdentityTlsCertAuthEvent
  | UpdateIdentityTlsCertAuthEvent
  | GetIdentityTlsCertAuthEvent
  | DeleteIdentityTlsCertAuthEvent
  | LoginIdentityOciAuthEvent
  | LoginIdentityOciAuthFailedEvent
  | AddIdentityOciAuthEvent
  | UpdateIdentityOciAuthEvent
  | GetIdentityOciAuthEvent
  | DeleteIdentityOciAuthEvent
  | LoginIdentityAzureAuthEvent
  | LoginIdentityAzureAuthFailedEvent
  | AddIdentityAzureAuthEvent
  | DeleteIdentityAzureAuthEvent
  | UpdateIdentityAzureAuthEvent
  | GetIdentityAzureAuthEvent
  | LoginIdentityOidcAuthEvent
  | LoginIdentityOidcAuthFailedEvent
  | AddIdentityOidcAuthEvent
  | DeleteIdentityOidcAuthEvent
  | UpdateIdentityOidcAuthEvent
  | GetIdentityOidcAuthEvent
  | LoginIdentityJwtAuthEvent
  | LoginIdentityJwtAuthFailedEvent
  | AddIdentityJwtAuthEvent
  | UpdateIdentityJwtAuthEvent
  | GetIdentityJwtAuthEvent
  | DeleteIdentityJwtAuthEvent
  | LoginIdentitySpiffeAuthEvent
  | LoginIdentitySpiffeAuthFailedEvent
  | AddIdentitySpiffeAuthEvent
  | UpdateIdentitySpiffeAuthEvent
  | GetIdentitySpiffeAuthEvent
  | RefreshIdentitySpiffeAuthBundleEvent
  | DeleteIdentitySpiffeAuthEvent
  | LoginIdentityLdapAuthEvent
  | LoginIdentityLdapAuthFailedEvent
  | AddIdentityLdapAuthEvent
  | UpdateIdentityLdapAuthEvent
  | GetIdentityLdapAuthEvent
  | RevokeIdentityLdapAuthEvent
  | ClearIdentityLdapAuthLockoutsEvent
  | UpdateUserOrgMembershipEvent
  | DeleteUserOrgMembershipEvent
  | InviteOrgMembersEvent
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
  | RestoreEnvironmentEvent
  | AddProjectMemberEvent
  | AddBatchProjectMemberEvent
  | RemoveProjectMemberEvent
  | GetProjectMemberPermissionAuditEvent
  | GetProjectIdentityPermissionAuditEvent
  | CreateFolderEvent
  | UpdateFolderEvent
  | DeleteFolderEvent
  | MoveFolderEvent
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
  | AddProjectGroupEvent
  | UpdateProjectGroupEvent
  | RemoveProjectGroupEvent
  | SecretApprovalMerge
  | SecretApprovalClosed
  | SecretApprovalRequest
  | SecretApprovalReopened
  | CreateCa
  | GetCa
  | GetCAs
  | UpdateCa
  | DeleteCa
  | RenewCa
  | ExportCertManagerProject
  | GetCaCsr
  | GetCaCerts
  | GetCaCert
  | SignIntermediate
  | ImportCaCert
  | ImportCaCrossSignedCert
  | DeleteCaCrossSignedCert
  | GetCaCrls
  | RegenerateCaCrl
  | GenerateCaCertificate
  | InstallCaCertVenafi
  | InstallCaCertAdcs
  | CreateCaSigningConfig
  | GetCaSigningConfig
  | UpdateCaSigningConfig
  | GetCaAutoRenewalConfig
  | UpdateCaAutoRenewalConfig
  | IssueCert
  | ImportCert
  | SignCert
  | GetCaCertificateTemplates
  | GetCert
  | DeleteCert
  | RevokeCert
  | RequestCertRevocation
  | CertRevocationFailed
  | AssignCertToApplication
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
  | CreateCertificateInventoryView
  | UpdateCertificateInventoryView
  | DeleteCertificateInventoryView
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
  | CreatePkiApplication
  | UpdatePkiApplication
  | DeletePkiApplication
  | GetPkiApplication
  | ListPkiApplications
  | AttachPkiApplicationProfiles
  | DetachPkiApplicationProfile
  | AddPkiApplicationMember
  | UpdatePkiApplicationMemberRole
  | RemovePkiApplicationMember
  | ListPkiApplicationMembers
  | GetPkiApplicationEnrollment
  | SetPkiApplicationApiEnrollment
  | ClearPkiApplicationApiEnrollment
  | SetPkiApplicationEstEnrollment
  | ClearPkiApplicationEstEnrollment
  | SetPkiApplicationAcmeEnrollment
  | ClearPkiApplicationAcmeEnrollment
  | RevealPkiApplicationAcmeEabSecret
  | RotatePkiApplicationAcmeEabSecret
  | SetPkiApplicationScepEnrollment
  | ClearPkiApplicationScepEnrollment
  | SetPkiApplicationMicrosoftAutoenrollmentEnrollment
  | ClearPkiApplicationMicrosoftAutoenrollmentEnrollment
  | ReenrollPkiApplicationMicrosoftAutoenrollmentComputers
  | GetCertManagerInstanceState
  | SetCertManagerActiveProject
  | InviteCertManagerUsers
  | UpdateCertManagerUser
  | RemoveCertManagerUser
  | RemoveCertManagerUsersBatch
  | AddCertManagerIdentity
  | UpdateCertManagerIdentity
  | RemoveCertManagerIdentity
  | AddCertManagerGroup
  | UpdateCertManagerGroup
  | RemoveCertManagerGroup
  | GetCertificateProfile
  | ListCertificateProfiles
  | GetCertificateProfileLatestActiveBundle
  | IssueCertificateFromProfile
  | SignCertificateFromProfile
  | OrderCertificateFromProfile
  | RenewCertificate
  | GetAzureAdCsTemplatesEvent
  | GetAdcsTemplatesEvent
  | AttemptCreateSlackIntegration
  | AttemptReinstallSlackIntegration
  | UpdateSlackIntegration
  | DeleteSlackIntegration
  | GetSlackIntegration
  | UpdateProjectWorkflowIntegrationConfig
  | GetProjectWorkflowIntegrationConfig
  | IntegrationSyncedEvent
  | CreateCmekEvent
  | UpdateCmekEvent
  | RotateCmekEvent
  | DeleteCmekEvent
  | GetCmekEvent
  | GetCmeksEvent
  | CmekEncryptEvent
  | CmekDecryptEvent
  | CmekSignEvent
  | CmekVerifyEvent
  | CmekGenerateMacEvent
  | CmekVerifyMacEvent
  | CmekListSigningAlgorithmsEvent
  | CmekGetPublicKeyEvent
  | CmekGetPrivateKeyEvent
  | CmekBulkGetPrivateKeysEvent
  | CmekBulkImportKeysEvent
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
  | RotateAppConnectionCredentialsEvent
  | CreateHsmConnectorEvent
  | UpdateHsmConnectorEvent
  | DeleteHsmConnectorEvent
  | TestHsmConnectorEvent
  | CreateGitHubAppEvent
  | DeleteGitHubAppEvent
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
  | PkiSyncHealthCheckEvent
  | PkiSyncTestHealthCheckEvent
  | PkiSyncRemoveCertificatesEvent
  | PkiSyncLinkCertificatesEvent
  | PkiSyncUnlinkCertificatesEvent
  | PkiSyncSkipCertificateEvent
  | PkiSyncSetDefaultCertificateEvent
  | PkiSyncClearDefaultCertificateEvent
  | CreatePkiDiscoveryEvent
  | UpdatePkiDiscoveryEvent
  | DeletePkiDiscoveryEvent
  | GetPkiDiscoveryEvent
  | GetPkiDiscoveriesEvent
  | TriggerPkiDiscoveryScanEvent
  | GetPkiInstallationEvent
  | GetPkiInstallationsEvent
  | UpdatePkiInstallationEvent
  | DeletePkiInstallationEvent
  | CreatePkiSignerEvent
  | UpdatePkiSignerEvent
  | DeletePkiSignerEvent
  | GetPkiSignerEvent
  | GetPkiSignersEvent
  | GetPkiSignerPublicKeyEvent
  | GetPkiSigningOperationsEvent
  | GetPkiSigningOperationEvent
  | PkiSignerSignEvent
  | EnablePkiSignerEvent
  | DisablePkiSignerEvent
  | ReissuePkiSignerCertificateEvent
  | RenewPkiSignerCertificateEvent
  | RevokePkiSignerCertificateEvent
  | PkiSignerCertificateRevocationDecidedEvent
  | PkiSignerCertificateRevokedByCaEvent
  | ImportPkiSignerCertificateEvent
  | ExportPkiSignerCertificateEvent
  | UpdatePkiSignerApprovalPolicyEvent
  | PkiSignerRequestToSignEvent
  | PkiSignerPreApproveSigningEvent
  | PkiSignerRevokeRequestEvent
  | AddPkiSignerMemberEvent
  | UpdatePkiSignerMemberEvent
  | RemovePkiSignerMemberEvent
  | OidcGroupMembershipMappingAssignUserEvent
  | OidcGroupMembershipMappingRemoveUserEvent
  | OidcProvisionedPlaceholderAdoptedEvent
  | SsoUserProfileSyncedEvent
  | SsoUserEmailSyncSkippedEvent
  | CreateKmipClientEvent
  | UpdateKmipClientEvent
  | DeleteKmipClientEvent
  | GetKmipClientEvent
  | GetKmipClientsEvent
  | CreateKmipClientCertificateEvent
  | SetupKmipEvent
  | GetKmipEvent
  | RegisterKmipServerEvent
  | KmipServerConnectEvent
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
  | MoveSecretRotationEvent
  | RotateSecretRotationEvent
  | ReconcileSecretRotationEvent
  | CheckSecretRotationCredentialsEvent
  | MicrosoftTeamsWorkflowIntegrationCreateEvent
  | MicrosoftTeamsWorkflowIntegrationDeleteEvent
  | MicrosoftTeamsWorkflowIntegrationCheckInstallationStatusEvent
  | MicrosoftTeamsWorkflowIntegrationGetTeamsEvent
  | MicrosoftTeamsWorkflowIntegrationGetEvent
  | MicrosoftTeamsWorkflowIntegrationListEvent
  | MicrosoftTeamsWorkflowIntegrationUpdateEvent
  | GetProjectPitCommitsEvent
  | GetProjectPitCommitAuthorsEvent
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
  | SecretScanningResourceAddEvent
  | SecretScanningResourceRemoveEvent
  | SecretScanningScanListEvent
  | SecretScanningFindingListEvent
  | SecretScanningFindingLocationListEvent
  | SecretScanningFindingUpdateEvent
  | SecretScanningConfigUpdateEvent
  | SecretScanningConfigReadEvent
  | OrgUpdateEvent
  | OrgAiConfigUpdateEvent
  | OrgSsoSettingsUpdateEvent
  | CreateOidcConfigEvent
  | UpdateOidcConfigEvent
  | DeleteOidcConfigEvent
  | ProjectCreateEvent
  | ProjectUpdateEvent
  | ProjectDeleteEvent
  | ProjectRestoreEvent
  | SecretReminderCreateEvent
  | SecretReminderGetEvent
  | SecretReminderDeleteEvent
  | DashboardListSecretsEvent
  | SearchSecretsByMetadataEvent
  | DashboardGetSecretValueEvent
  | DashboardGetSecretVersionValueEvent
  | ViewSecretManagementInsightsCalendarEvent
  | ViewSecretManagementInsightsAccessVolumeEvent
  | ViewSecretManagementInsightsUnusedAccessEvent
  | ViewSecretManagementInsightsOrgAuthMethodDistributionEvent
  | ViewSecretManagementInsightsAccessLocationsEvent
  | ViewInsightsAuthMethodsEvent
  | ViewSecretManagementInsightsSummaryEvent
  | ViewInsightsSecretsDuplicationEvent
  | ViewInsightsOrgSecretsDuplicationEvent
  | ViewSecretManagementInsightsCountsEvent
  | ViewSecretManagementInsightsUsageEvent
  | ViewSecretManagementInsightsProjectWarningsEvent
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
  | ProjectRoleCreateEvent
  | ProjectRoleUpdateEvent
  | ProjectRoleDeleteEvent
  | ProjectRoleListEvent
  | ProjectRoleGetEvent
  | OrgRoleCreateEvent
  | OrgRoleUpdateEvent
  | OrgRoleDeleteEvent
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
  | AgentVaultAccessBundleCreateEvent
  | AgentVaultAccessBundleUpdateEvent
  | AgentVaultAccessBundleDeleteEvent
  | AgentVaultServiceCreateEvent
  | AgentVaultServiceUpdateEvent
  | AgentVaultServiceDeleteEvent
  | AgentVaultVariableCreateEvent
  | AgentVaultVariableUpdateEvent
  | AgentVaultVariableDeleteEvent
  | AgentVaultVariableValueViewEvent
  | AgentVaultOauthVariableConnectEvent
  | AgentVaultPersonalValuesSetEvent
  | AgentVaultPersonalValuesDeleteEvent
  | AgentVaultHookCreateEvent
  | AgentVaultHookUpdateEvent
  | AgentVaultHookDeleteEvent
  | AgentVaultSkillCreateEvent
  | AgentVaultSkillVersionCreateEvent
  | AgentVaultSkillVersionRestoreEvent
  | AgentVaultSkillVersionViewEvent
  | AgentVaultSkillRenameEvent
  | AgentVaultSkillDeleteEvent
  | AgentVaultAccessBundleSkillAddEvent
  | AgentVaultAccessBundleSkillRemoveEvent
  | AgentVaultAccessBundleServiceAddEvent
  | AgentVaultAccessBundleServiceRemoveEvent
  | AgentVaultSkillsDeliveredEvent
  | AgentVaultProductMemberAddEvent
  | AgentVaultProductMemberUpdateEvent
  | AgentVaultProductMemberRemoveEvent
  | AgentVaultAccessBundleMemberAddEvent
  | AgentVaultAccessBundleMemberRemoveEvent
  | AgentVaultSessionMintEvent
  | AgentVaultDelegationSetEvent
  | AgentVaultDelegationDeleteEvent
  | AgentVaultSessionUpdateEvent
  | AgentVaultSessionRevokeEvent
  | AgentVaultProxyRegisterEvent
  | AgentVaultProxyTokenReissueEvent
  | AgentVaultProxyTokenRotateEvent
  | AgentVaultProxyEnrollEvent
  | AgentVaultProxyUpdateEvent
  | AgentVaultProxyRevokeEvent
  | AgentVaultProxyDeleteEvent
  | AgentVaultSessionLogSettingsUpdateEvent
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
  | PamAccountRotateCredentialsEvent
  | PamAccountHeartbeatEvent
  | PamAccountSetRotationAccountEvent
  | PamAccessRequestCreateEvent
  | PamAccessRequestReviewEvent
  | PamAccessGrantRevokeEvent
  | PamApprovalConfigUpdateEvent
  | UpdateCertificateRenewalConfigEvent
  | UpdateCertificateMetadataEvent
  | DisableCertificateRenewalConfigEvent
  | CreateCertificateRequestEvent
  | GetCertificateRequestEvent
  | GetCertificateFromRequestEvent
  | ListCertificateRequestsEvent
  | TriggerCertificateRequestValidationEvent
  | CancelCertificateRequestEvent
  | AutomatedRenewCertificate
  | AutomatedRenewCertificateFailed
  | CertificateIssuanceFailedEvent
  | UserLoginEvent
  | SelectOrganizationEvent
  | SelectOrganizationRefusedEvent
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
  | ApprovalRequestAutoApproveEvent
  | ApprovalRequestRejectEvent
  | ApprovalRequestCancelEvent
  | ApprovalRequestGrantListEvent
  | ApprovalRequestGrantGetEvent
  | ApprovalRequestGrantRevokeEvent
  | PamAccessPolicyBypassedEvent
  | PamAccessRequestAutoApprovedEvent
  | AccessApprovalRequestCreateEvent
  | AccessApprovalRequestReviewEvent
  | AccessApprovalRequestRevokeEvent
  | AccessApprovalRequestDelegatedDispatchRetryEvent
  | AccessApprovalRequestDelegatedDecisionEvent
  | AccessApprovalRequestCancelEvent
  | AccessApprovalRequestUpdateEvent
  | CreateAcmeAccountEvent
  | RetrieveAcmeAccountEvent
  | CreateAcmeOrderEvent
  | FinalizeAcmeOrderEvent
  | DownloadAcmeCertificateEvent
  | RespondToAcmeChallengeEvent
  | PassedAcmeChallengeEvent
  | AttemptAcmeChallengeEvent
  | FailAcmeChallengeEvent
  | CreateDynamicSecretEvent
  | UpdateDynamicSecretEvent
  | DeleteDynamicSecretEvent
  | GetDynamicSecretEvent
  | ListDynamicSecretsEvent
  | CreateProxiedServiceEvent
  | UpdateProxiedServiceEvent
  | DeleteProxiedServiceEvent
  | SignAgentProxyIntermediateCaEvent
  | ListDynamicSecretLeasesEvent
  | CreateDynamicSecretLeaseEvent
  | DeleteDynamicSecretLeaseEvent
  | RenewDynamicSecretLeaseEvent
  | GetDynamicSecretLeaseEvent
  | UpdateCertificateCleanupConfigEvent
  | CertificateCleanupCompletedEvent
  | ScepEnrollmentEvent
  | ScepRenewalEvent
  | ScepDynamicChallengeGeneratedEvent
  | MicrosoftAutoenrollmentIssuanceEvent
  | MicrosoftAutoenrollmentRequestRefusedEvent
  | SecretValidationRuleCreateEvent
  | SecretValidationRuleUpdateEvent
  | SecretValidationRuleDeleteEvent
  | ExternalMigrationCreateEvent
  | ExternalMigrationUpdateEvent
  | ExternalMigrationDeleteEvent
  | ImportVaultSecretsEvent
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
  | GatewayCreateEvent
  | GatewayUpdateEvent
  | GatewayDeleteEvent
  | GatewayEnrollmentTokenCreateEvent
  | GatewayEnrollEvent
  | GatewayConnectEvent
  | ResourceAuthMethodLoginEvent
  | ResourceAuthMethodLoginFailedEvent
  | ResourceAuthMethodCreateEvent
  | ResourceAuthMethodUpdateEvent
  | ResourceAuthMethodRevokeEvent
  | RelayCreateEvent
  | RelayUpdateEvent
  | RelayDeleteEvent
  | RelayEnrollmentTokenCreateEvent
  | KmipServerCreateEvent
  | KmipServerUpdateEvent
  | KmipServerDeleteEvent
  | KmipServerEnrollmentTokenCreateEvent
  | GatewayPoolCreateEvent
  | GatewayPoolUpdateEvent
  | GatewayPoolDeleteEvent
  | GatewayPoolAddMemberEvent
  | GatewayPoolRemoveMemberEvent
  | CreateHoneyTokenEvent
  | UpdateHoneyTokenEvent
  | RevokeHoneyTokenEvent
  | DeleteHoneyTokenEvent
  | TriggerHoneyTokenEvent
  | CreateGroupEvent
  | UpdateGroupEvent
  | DeleteGroupEvent
  | LinkGroupToSubOrgEvent
  | UpdateGroupOrgMembershipEvent
  | UnlinkGroupFromSubOrgEvent
  | RevokeOrgProjectAccessEvent
  | AddUserToGroupEvent
  | RemoveUserFromGroupEvent
  | AddIdentityToGroupEvent
  | RemoveIdentityFromGroupEvent
  | AddGroupToProjectEvent
  | UpdateGroupProjectMembershipEvent
  | RemoveGroupFromProjectEvent
  | CreateProjectFolderGrantEvent
  | DeleteProjectFolderGrantEvent
  | CreateSecretFolderAccessEvent
  | UpdateSecretFolderAccessEvent
  | DeleteSecretFolderAccessEvent;
