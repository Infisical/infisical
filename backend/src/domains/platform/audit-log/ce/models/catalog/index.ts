import type { TAgentVaultAuditLogEvent } from "./agent-vault";
import type { TAppConnectionAuditLogEvent } from "./app-connection";
import type { TApprovalsAuditLogEvent } from "./approvals";
import type { TGatewayAuditLogEvent } from "./gateway";
import type { TIdentityAuditLogEvent } from "./identity";
import type { TIdentityAuthAuditLogEvent } from "./identity-auth";
import type { TKmsAuditLogEvent } from "./kms";
import type { TMiscAuditLogEvent } from "./misc";
import type { TOrganizationAuditLogEvent } from "./organization";
import type { TPamAuditLogEvent } from "./pam";
import type { TPkiAuditLogEvent } from "./pki";
import type { TPkiCaAuditLogEvent } from "./pki-ca";
import type { TPkiSyncAuditLogEvent } from "./pki-sync";
import type { TProjectAuditLogEvent } from "./project";
import type { TSecretRotationAuditLogEvent } from "./secret-rotation";
import type { TSecretScanningAuditLogEvent } from "./secret-scanning";
import type { TSecretSyncAuditLogEvent } from "./secret-sync";
import type { TSecretsAuditLogEvent } from "./secrets";
import type { TSignerAuditLogEvent } from "./signer";

export type { TAuditLogAppConnectionCreate, TAuditLogAppConnectionUpdate } from "./app-connection";
export type { TAuditLogApprovalRequestSubject } from "./approvals";
export type { TAuditLogAllowedField } from "./identity-auth";
export type { TAuditLogCollapseSummary } from "./misc";
export type { TAuditLogIdpMfaSignal } from "./organization";
export type { TAuditLogRenewalChange } from "./pki";
export type { TAuditLogHostCommandResult } from "./pki-sync";
export type { TAuditLogProjectTemplate, TAuditLogWebhookPayload } from "./project";
export type {
  TAuditLogSecretRotationCreate,
  TAuditLogSecretRotationDelete,
  TAuditLogSecretRotationRaw,
  TAuditLogSecretRotationUpdate
} from "./secret-rotation";
export type {
  TAuditLogSecretScanningDataSourceCreate,
  TAuditLogSecretScanningDataSourceDelete,
  TAuditLogSecretScanningDataSourceTrigger,
  TAuditLogSecretScanningDataSourceUpdate,
  TAuditLogSecretScanningFindingUpdate
} from "./secret-scanning";
export type {
  TAuditLogSecretSyncCreate,
  TAuditLogSecretSyncDelete,
  TAuditLogSecretSyncRaw,
  TAuditLogSecretSyncUpdate
} from "./secret-sync";
export type { TAuditLogDuplicateSecretAttributes } from "./secrets";
export type * from "./shared";
export type { TAuditLogSignerExternalConfiguration } from "./signer";
export type { TMfaSatisfiedBy, TSsoUserEmailSyncSkipReason, PermissionDeniedEvent } from "./organization";
export type { WebhookTriggeredEvent } from "./project";
export type { SecretFolderAccessEventMetadata } from "./secrets";

export type TAuditLogEvent =
  | TAgentVaultAuditLogEvent
  | TAppConnectionAuditLogEvent
  | TApprovalsAuditLogEvent
  | TGatewayAuditLogEvent
  | TIdentityAuditLogEvent
  | TIdentityAuthAuditLogEvent
  | TKmsAuditLogEvent
  | TMiscAuditLogEvent
  | TOrganizationAuditLogEvent
  | TPamAuditLogEvent
  | TPkiAuditLogEvent
  | TPkiCaAuditLogEvent
  | TPkiSyncAuditLogEvent
  | TProjectAuditLogEvent
  | TSecretRotationAuditLogEvent
  | TSecretScanningAuditLogEvent
  | TSecretSyncAuditLogEvent
  | TSecretsAuditLogEvent
  | TSignerAuditLogEvent;
