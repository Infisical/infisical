import { describe, expectTypeOf, test } from "vitest";

import type * as Catalog from "@app/domains/platform/audit-log/ce/module";
import type { GatewayTransport } from "@app/ee/services/gateway-v2/gateway-v2-constants";
import type { HoneyTokenManagedBy, HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import type { KmipPermission } from "@app/ee/services/kmip/kmip-enum";
import type { AcmeChallengeType, AcmeIdentifierType } from "@app/ee/services/pki-acme/pki-acme-schemas";
import type { CertificateSource, PkiKeystorePasswordChange } from "@app/ee/services/pki-discovery/pki-discovery-types";
import type { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import type { ScepEnrollmentStatus } from "@app/ee/services/pki-scep/pki-scep-types";
import type { TCreateProjectTemplateDTO } from "@app/ee/services/project-template/project-template-types";
import type {
  ResourceAuthMethodType,
  TSettableAuthMethod
} from "@app/ee/services/resource-auth-method/resource-auth-method-fns";
import type { ApprovalStatus } from "@app/ee/services/secret-change-request/secret-change-request-types";
import type {
  SecretRotation,
  SecretRotationStatus
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import type {
  TCreateSecretRotationV2DTO,
  TDeleteSecretRotationV2DTO,
  TSecretRotationV2Raw,
  TUpdateSecretRotationV2DTO
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import type {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import type {
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TTriggerSecretScanningDataSourceDTO,
  TUpdateSecretScanningDataSourceDTO,
  TUpdateSecretScanningFindingDTO
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import type { AppConnection } from "@app/services/app-connection/app-connection-enums";
import type {
  TCreateAppConnectionDTO,
  TUpdateAppConnectionDTO
} from "@app/services/app-connection/app-connection-types";
import type { TApprovalRequestSubjectMetadata } from "@app/services/approval-policy/approval-policy-types";
import type { TIdpMfaSignal } from "@app/services/auth/idp-mfa-signal";
import type {
  CaCrlRegenerationTrigger,
  CaStatus
} from "@app/services/certificate-authority/certificate-authority-enums";
import type { CertificateIssuanceOperation } from "@app/services/certificate-common/certificate-constants";
import type { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import type { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import type {
  CertificateRenewalKeySource,
  TRenewalAuditChange
} from "@app/services/certificate-v3/certificate-v3-types";
import type {
  CertExtendedKeyUsage,
  CertificateRevocationSource,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  CrlReason
} from "@app/services/certificate/certificate-types";
import type { ExternalMigrationImportStatus } from "@app/services/external-migration/external-migration-types";
import type { TAllowedFields } from "@app/services/identity-ldap-auth/identity-ldap-auth-types";
import type { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import type { ObjectStorageType } from "@app/services/object-storage/object-storage-types";
import type { OrgAccessRemovalCause } from "@app/services/org/org-membership-events";
import type { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import type { PkiItemType } from "@app/services/pki-collection/pki-collection-types";
import type { THealthCheckCommandResult } from "@app/services/pki-sync/pki-sync-health-check-command-fns";
import type { TPostSyncCommandResult } from "@app/services/pki-sync/pki-sync-post-sync-command-fns";
import type { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";
import type {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TSecretSyncRaw,
  TUpdateSecretSyncDTO
} from "@app/services/secret-sync/secret-sync-types";
import type { TDuplicateSecretAttributes } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";
import type { CertKeySource } from "@app/services/signer/signer-enums";
import type { TSignerExternalConfigurationInput } from "@app/services/signer/signer-types";
import type { TWebhookPayloads } from "@app/services/webhook/webhook-types";
import type { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

// The audit log catalog owns its payload types instead of importing the producing modules' types, so a change to
// a producer's type can't silently change what is stored. These checks pin the copies to their sources at compile
// time (tsc runs over tests): a value added to or removed from an enum, or a field the snapshot no longer accepts,
// fails here, next to the producer that changed.
describe("audit log catalog", () => {
  test("should list every value of each producer enum, and nothing else", () => {
    expectTypeOf<`${GatewayTransport}`>().toEqualTypeOf<Catalog.TAuditLogGatewayTransport>();
    expectTypeOf<`${CertificateSource}`>().toEqualTypeOf<Catalog.TAuditLogCertificateSource>();
    expectTypeOf<`${PkiKeystorePasswordChange}`>().toEqualTypeOf<Catalog.TAuditLogPkiKeystorePasswordChange>();
    expectTypeOf<`${ScepChallengeType}`>().toEqualTypeOf<Catalog.TAuditLogScepChallengeType>();
    expectTypeOf<`${ScepEnrollmentStatus}`>().toEqualTypeOf<Catalog.TAuditLogScepEnrollmentStatus>();
    expectTypeOf<ResourceAuthMethodType>().toEqualTypeOf<Catalog.TAuditLogResourceAuthMethodType>();
    expectTypeOf<TSettableAuthMethod>().toEqualTypeOf<Catalog.TAuditLogSettableAuthMethod>();
    expectTypeOf<`${SecretRotation}`>().toEqualTypeOf<Catalog.TAuditLogSecretRotation>();
    expectTypeOf<`${SecretRotationStatus}`>().toEqualTypeOf<Catalog.TAuditLogSecretRotationStatus>();
    expectTypeOf<`${SecretScanningDataSource}`>().toEqualTypeOf<Catalog.TAuditLogSecretScanningDataSource>();
    expectTypeOf<`${SecretScanningScanStatus}`>().toEqualTypeOf<Catalog.TAuditLogSecretScanningScanStatus>();
    expectTypeOf<`${SecretScanningScanType}`>().toEqualTypeOf<Catalog.TAuditLogSecretScanningScanType>();
    expectTypeOf<`${SecretScanningFindingStatus}`>().toEqualTypeOf<Catalog.TAuditLogSecretScanningFindingStatus>();
    expectTypeOf<`${AppConnection}`>().toEqualTypeOf<Catalog.TAuditLogAppConnection>();
    expectTypeOf<`${CaCrlRegenerationTrigger}`>().toEqualTypeOf<Catalog.TAuditLogCaCrlRegenerationTrigger>();
    expectTypeOf<`${CaStatus}`>().toEqualTypeOf<Catalog.TAuditLogCaStatus>();
    expectTypeOf<`${CertificateIssuanceOperation}`>().toEqualTypeOf<Catalog.TAuditLogCertificateIssuanceOperation>();
    expectTypeOf<`${EnrollmentType}`>().toEqualTypeOf<Catalog.TAuditLogEnrollmentType>();
    expectTypeOf<`${CertificateRequestStatus}`>().toEqualTypeOf<Catalog.TAuditLogCertificateRequestStatus>();
    expectTypeOf<`${CertificateRenewalKeySource}`>().toEqualTypeOf<Catalog.TAuditLogCertificateRenewalKeySource>();
    expectTypeOf<`${CertExtendedKeyUsage}`>().toEqualTypeOf<Catalog.TAuditLogCertExtendedKeyUsage>();
    expectTypeOf<`${CertificateRevocationSource}`>().toEqualTypeOf<Catalog.TAuditLogCertificateRevocationSource>();
    expectTypeOf<`${CertKeyAlgorithm}`>().toEqualTypeOf<Catalog.TAuditLogCertKeyAlgorithm>();
    expectTypeOf<`${CertKeyUsage}`>().toEqualTypeOf<Catalog.TAuditLogCertKeyUsage>();
    expectTypeOf<`${CertStatus}`>().toEqualTypeOf<Catalog.TAuditLogCertStatus>();
    expectTypeOf<`${CrlReason}`>().toEqualTypeOf<Catalog.TAuditLogCrlReason>();
    expectTypeOf<`${ExternalMigrationImportStatus}`>().toEqualTypeOf<Catalog.TAuditLogExternalMigrationImportStatus>();
    expectTypeOf<`${ObjectStorageType}`>().toEqualTypeOf<Catalog.TAuditLogObjectStorageType>();
    expectTypeOf<`${OrgAccessRemovalCause}`>().toEqualTypeOf<Catalog.TAuditLogOrgAccessRemovalCause>();
    expectTypeOf<`${PkiAlertEventType}`>().toEqualTypeOf<Catalog.TAuditLogPkiAlertEventType>();
    expectTypeOf<`${PkiItemType}`>().toEqualTypeOf<Catalog.TAuditLogPkiItemType>();
    expectTypeOf<`${SecretSync}`>().toEqualTypeOf<Catalog.TAuditLogSecretSync>();
    expectTypeOf<`${SecretSyncImportBehavior}`>().toEqualTypeOf<Catalog.TAuditLogSecretSyncImportBehavior>();
    expectTypeOf<`${CertKeySource}`>().toEqualTypeOf<Catalog.TAuditLogCertKeySource>();
    expectTypeOf<`${WorkflowIntegration}`>().toEqualTypeOf<Catalog.TAuditLogWorkflowIntegration>();
    expectTypeOf<`${KmipPermission}`>().toEqualTypeOf<Catalog.TAuditLogKmipPermission>();
    expectTypeOf<`${AcmeChallengeType}`>().toEqualTypeOf<Catalog.TAuditLogAcmeChallengeType>();
    expectTypeOf<`${AcmeIdentifierType}`>().toEqualTypeOf<Catalog.TAuditLogAcmeIdentifierType>();
    expectTypeOf<`${ApprovalStatus}`>().toEqualTypeOf<Catalog.TAuditLogApprovalStatus>();
    expectTypeOf<`${HoneyTokenType}`>().toEqualTypeOf<Catalog.TAuditLogHoneyTokenType>();
    expectTypeOf<`${HoneyTokenManagedBy}`>().toEqualTypeOf<Catalog.TAuditLogHoneyTokenManagedBy>();
  });

  test("should accept what each producer type it replaced carries", () => {
    expectTypeOf<TIdentityTrustedIp>().toExtend<Catalog.TAuditLogTrustedIp>();
    expectTypeOf<TAllowedFields>().toExtend<Catalog.TAuditLogAllowedField>();
    expectTypeOf<TIdpMfaSignal>().toExtend<Catalog.TAuditLogIdpMfaSignal>();
    expectTypeOf<TRenewalAuditChange>().toExtend<Catalog.TAuditLogRenewalChange>();
    expectTypeOf<THealthCheckCommandResult>().toExtend<Catalog.TAuditLogHostCommandResult>();
    expectTypeOf<TPostSyncCommandResult>().toExtend<Catalog.TAuditLogHostCommandResult>();
    expectTypeOf<TSignerExternalConfigurationInput>().toExtend<Catalog.TAuditLogSignerExternalConfiguration>();
    expectTypeOf<TApprovalRequestSubjectMetadata>().toExtend<Catalog.TAuditLogApprovalRequestSubject>();
    expectTypeOf<TDuplicateSecretAttributes>().toExtend<Catalog.TAuditLogDuplicateSecretAttributes>();
    expectTypeOf<TWebhookPayloads>().toExtend<Catalog.TAuditLogWebhookPayload>();
    expectTypeOf<TCreateProjectTemplateDTO>().toExtend<Catalog.TAuditLogProjectTemplate>();
    expectTypeOf<TCreateAppConnectionDTO>().toExtend<Catalog.TAuditLogAppConnectionCreate>();
    expectTypeOf<TUpdateAppConnectionDTO>().toExtend<Catalog.TAuditLogAppConnectionUpdate>();
    expectTypeOf<TCreateSecretSyncDTO>().toExtend<Catalog.TAuditLogSecretSyncCreate>();
    expectTypeOf<TUpdateSecretSyncDTO>().toExtend<Catalog.TAuditLogSecretSyncUpdate>();
    expectTypeOf<TDeleteSecretSyncDTO>().toExtend<Catalog.TAuditLogSecretSyncDelete>();
    expectTypeOf<TSecretSyncRaw>().toExtend<Catalog.TAuditLogSecretSyncRaw>();
    expectTypeOf<TCreateSecretRotationV2DTO>().toExtend<Catalog.TAuditLogSecretRotationCreate>();
    expectTypeOf<TUpdateSecretRotationV2DTO>().toExtend<Catalog.TAuditLogSecretRotationUpdate>();
    expectTypeOf<TDeleteSecretRotationV2DTO>().toExtend<Catalog.TAuditLogSecretRotationDelete>();
    expectTypeOf<TSecretRotationV2Raw>().toExtend<Catalog.TAuditLogSecretRotationRaw>();
    expectTypeOf<TCreateSecretScanningDataSourceDTO>().toExtend<Catalog.TAuditLogSecretScanningDataSourceCreate>();
    expectTypeOf<TUpdateSecretScanningDataSourceDTO>().toExtend<Catalog.TAuditLogSecretScanningDataSourceUpdate>();
    expectTypeOf<TDeleteSecretScanningDataSourceDTO>().toExtend<Catalog.TAuditLogSecretScanningDataSourceDelete>();
    expectTypeOf<TTriggerSecretScanningDataSourceDTO>().toExtend<Catalog.TAuditLogSecretScanningDataSourceTrigger>();
    expectTypeOf<TUpdateSecretScanningFindingDTO>().toExtend<Catalog.TAuditLogSecretScanningFindingUpdate>();
  });
});
