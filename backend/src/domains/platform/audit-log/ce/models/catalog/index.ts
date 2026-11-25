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

export type { TAuditLogCollapseSummary } from "./misc";
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
