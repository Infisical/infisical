import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import * as x509 from "@peculiar/x509";
import { KeyObject } from "crypto";
import { Knex } from "knex";

import {
  AccessScope,
  ActionProjectType,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType,
  TCertificates,
  TPkiSignerCertificateRevocations,
  TPkiSigners
} from "@app/db/schemas";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionSignerActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { signingService } from "@app/lib/crypto/sign/signing";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import {
  ecdsaRawRsToDer,
  mapSigningAlgorithmToPkcs11Mechanism,
  Pkcs11Mechanism,
  wrapRsaPkcs1DigestInfo
} from "@app/lib/csr/pkcs11-algorithm-map";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { lockAndAssertActiveOrgAccess } from "@app/services/org/org-access-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { findUsersWithOrgAccess } from "../alert/alert-principal-scope-fns";
import {
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "../approval-policy/approval-policy-dal";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus
} from "../approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory, TApprovalRequestGrantsDALFactory } from "../approval-policy/approval-request-dal";
import {
  CODE_SIGNING_SCOPE_FIELD_LABELS,
  CodeSigningScopeField
} from "../approval-policy/code-signing/code-signing-policy-enums";
import {
  buildObservedSigningContext,
  getCodeSigningScopeMismatches,
  redactCommandCredentials,
  TObservedSigningContext
} from "../approval-policy/code-signing/code-signing-policy-fns";
import {
  TCodeSigningGrantAttributes,
  TCodeSigningRequestData
} from "../approval-policy/code-signing/code-signing-policy-types";
import { ActorType } from "../auth/auth-type";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaCapability, CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { caSupportsCapability } from "../certificate-authority/certificate-authority-maps";
import {
  CodeSigningOrderStatus,
  DigiCertRevocationRequestStatus
} from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { TDigiCertCertificateAuthorityFns } from "../certificate-authority/digicert/digicert-certificate-authority-fns";
import { MAX_CS_VALIDITY_DAYS } from "../certificate-authority/digicert/digicert-code-signing-fns";
import { TInternalCertificateAuthorityServiceFactory } from "../certificate-authority/internal/internal-certificate-authority-service";
import { DigiCertExternalMetadataSchema } from "../certificate-common/external-metadata-schemas";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import {
  assertCertificateNotDeleted,
  extractCertificateAlgorithms,
  getCertificateCredentials
} from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateServiceFactory } from "../certificate/certificate-service";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertStatus, CrlReason } from "../certificate/certificate-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { isBuiltInSignerRole, unknownSignerRoleMessage } from "../signer-membership/signer-membership-service";
import { TUserDALFactory } from "../user/user-dal";
import { withSignerCertificateLock } from "./signer-certificate-lock";
import { TSignerDALFactory, TSignerWithCertificate } from "./signer-dal";
import {
  CertKeySource,
  DigiCertLifecycleMode,
  HsmKeyAlgorithm,
  isSignerRevokedOrRevoking,
  SIGNER_APPROVAL_REQUIRED_ERROR_NAME,
  SignerAutoRenewalOutcome,
  SignerIssuanceJobCancelReason,
  SignerRevocationStatus,
  SignerStatus,
  SigningOperationStatus,
  TSignerCertificateRequestStatus,
  TUnsettledSignerRevocationStatus
} from "./signer-enums";
import { formatSignerIssuanceErrorReason } from "./signer-issuance-errors";
import {
  assertDigiCertCodeSigningKey,
  assertHsmKeyMatchesCertificate,
  buildAttachedCertificatePatch,
  getSignerJobDigiCertOrderId,
  issueHsmBackedSignerCertificate,
  issueSignerCertificate,
  mapCertKeyAlgorithmToHsmKeyAlgorithm,
  renewHsmBackedSignerCertificate
} from "./signer-issuance-fns";
import { TSignerIssuanceServiceFactory } from "./signer-issuance-service";
import { TSignerRevocationDALFactory } from "./signer-revocation-dal";
import {
  SignerExternalCaConfigSchema,
  TCheckCertificateImportDTO,
  TCreateSignerDTO,
  TDeleteSignerDTO,
  TDisableSignerDTO,
  TEnableSignerDTO,
  TExportCertificateDTO,
  TGetPublicKeyDTO,
  TGetSignerDTO,
  TGetSigningOperationDTO,
  TImportCertificateDTO,
  TListSignersDTO,
  TListSigningOperationsDTO,
  TReissueCertificateDTO,
  TRenewCertificateDTO,
  TRevokeSignerCertificateDTO,
  TSignDataDTO,
  TSignerCertificateInput,
  TSignerExternalCaConfig,
  TSignerExternalConfigurationInput,
  TUpdateSignerDTO
} from "./signer-types";
import { TSigningOperationDALFactory } from "./signing-operation-dal";

const MAX_DATA_BYTES = 128;
const DEFAULT_CERTIFICATE_TTL_DAYS = 365;
const MAX_AUTO_RENEWAL_RETRY_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_AUTO_RENEWAL_RETRY_BACKOFF_MS = 24 * 60 * 60 * 1000;
const AUTO_RENEWAL_DUE_MARGIN_MS = 60 * 60 * 1000;

const IMPORTABLE_HSM_KEY_ALGORITHMS: readonly string[] = [
  CertKeyAlgorithm.RSA_3072,
  CertKeyAlgorithm.RSA_4096,
  CertKeyAlgorithm.ECDSA_P256,
  CertKeyAlgorithm.ECDSA_P384
];

const IMPORTED_CERTIFICATE_FALLBACK_COMMON_NAME = "Code signing certificate";

const CODE_SIGNING_SUPPORTED_EXTERNAL_CA_TYPES = new Set<CaType>([
  CaType.AWS_PCA,
  CaType.AZURE_AD_CS,
  CaType.ADCS,
  CaType.DIGICERT
]);

const assertCaTypeSupportsCodeSigning = (caType: CaType): void => {
  if (caType === CaType.INTERNAL) return;
  if (!CODE_SIGNING_SUPPORTED_EXTERNAL_CA_TYPES.has(caType)) {
    throw new BadRequestError({
      message:
        "Code signing is only supported on Internal CAs, AWS Private CA, Azure AD CS, ADCS, and DigiCert. Pick a different certificate authority."
    });
  }
};

const revokedCertificateMessage = (signerName: string) =>
  `Signer '${signerName}' can't be used because its certificate was revoked. Reissue it with a new key from the signer's options to keep signing.`;

const pendingRevocationMessage = (signerName: string, requestId: number) =>
  `Signer '${signerName}' has a revocation waiting for approval in DigiCert CertCentral (request #${requestId}). Approve or reject it there first.`;

const digiCertRejectedRevocationMessage = (requestId: number) =>
  `DigiCert rejected revocation request #${requestId}, so the certificate wasn't revoked.`;

const revocationInProgressMessage = (signerName: string) =>
  `Signer '${signerName}' is being revoked. Wait for the revoke to finish, or revoke the certificate again if it didn't finish.`;

const UNFINISHED_REVOKE_REASON =
  "The revoke didn't finish, so the certificate may still be valid. Revoke the certificate again.";

const certificateRequestInProgressMessage = (signerName: string) =>
  `Signer '${signerName}' is already waiting for a new certificate. Try again after it's issued.`;

const signerCertificateLockHeldMessage = (signerName: string) =>
  `Signer '${signerName}' is being changed by another request right now. Try again in a moment.`;

const assertSignerNotRevoked = (
  signer: Pick<TSignerWithCertificate, "name" | "status" | "certificateStatus">,
  { allowRevoked = false }: { allowRevoked?: boolean } = {}
) => {
  if (signer.status === SignerStatus.RevocationPending) {
    throw new BadRequestError({ message: revocationInProgressMessage(signer.name) });
  }
  if (!allowRevoked && (signer.status === SignerStatus.Revoked || signer.certificateStatus === CertStatus.REVOKED)) {
    throw new BadRequestError({ message: revokedCertificateMessage(signer.name) });
  }
};

const computeEffectiveStatus = (signer: {
  status: string;
  certificateNotAfter?: Date | string | null;
  certificateStatus?: string | null;
}): SignerStatus => {
  const dbStatus = signer.status as SignerStatus;
  if (isSignerRevokedOrRevoking(dbStatus)) return dbStatus;
  if (dbStatus === SignerStatus.Pending || dbStatus === SignerStatus.Failed) return dbStatus;
  if (signer.certificateStatus === CertStatus.REVOKED) return SignerStatus.Revoked;
  if (dbStatus !== SignerStatus.Active) return dbStatus;
  if (signer.certificateNotAfter && new Date(signer.certificateNotAfter) < new Date()) {
    return SignerStatus.Expired;
  }
  return SignerStatus.Active;
};

type TSignerServiceFactoryDep = {
  signerDAL: TSignerDALFactory;
  signerRevocationDAL: TSignerRevocationDALFactory;
  signingOperationDAL: TSigningOperationDALFactory;
  hsmConnectorService: Pick<
    THsmConnectorServiceFactory,
    "sign" | "signWithKeyId" | "generateKeyPair" | "getPublicKey" | "assertAttachPermission"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById" | "updateById" | "findByIdForUpdate" | "findByIdForShare">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateService: Pick<TCertificateServiceFactory, "revokeOwnedCertificate" | "completeOwnedCertificateRevocation">;
  signerIssuanceService: Pick<
    TSignerIssuanceServiceFactory,
    | "requestIssuance"
    | "getLatestIssuanceRequest"
    | "runPendingJobNow"
    | "cancelOpenRequests"
    | "cancelPendingDigiCertReissue"
    | "revokeUnattachedCertificate"
    | "cleanUpRequestsBeforeDelete"
    | "revokeAtCa"
  >;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  digicertFns: Pick<
    TDigiCertCertificateAuthorityFns,
    | "revokeCertificate"
    | "getRevocationRequestStatus"
    | "assertCodeSigningOrderReusable"
    | "fetchIssuedCodeSigningCertificate"
    | "prepareCodeSigningCertificateImport"
  >;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "encryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "create">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "delete" | "find">;
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "create" | "find" | "delete" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete" | "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  orgDAL: Pick<TOrgDALFactory, "lockActorsForOrgAccess" | "findActorsWithActiveOrgAccess" | "findMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  licenseService: TLicenseService;
};

export type TSignerServiceFactory = ReturnType<typeof signerServiceFactory>;

const getKeyAlgorithmFamily = (key: KeyObject): AsymmetricKeyAlgorithm => {
  const keyType = key.asymmetricKeyType;
  if (keyType === "rsa") {
    return AsymmetricKeyAlgorithm.RSA_4096;
  }
  if (keyType === "ec") {
    const { namedCurve } = key.asymmetricKeyDetails as { namedCurve?: string };
    switch (namedCurve) {
      case "prime256v1":
      case "P-256":
        return AsymmetricKeyAlgorithm.ECC_NIST_P256;
      case "secp384r1":
      case "P-384":
        return AsymmetricKeyAlgorithm.ECC_NIST_P384;
      case "secp521r1":
      case "P-521":
        return AsymmetricKeyAlgorithm.ECC_NIST_P521;
      default:
        throw new BadRequestError({
          message: `Unsupported EC curve: ${namedCurve}. Supported curves: P-256, P-384, P-521.`
        });
    }
  }
  throw new BadRequestError({ message: `Unsupported key type: ${keyType}` });
};

const validateSigningAlgorithmForKey = (signingAlgorithm: SigningAlgorithm, keyAlgorithm: AsymmetricKeyAlgorithm) => {
  const isRsaKey = keyAlgorithm.startsWith("RSA");
  const isRsaAlgorithm = signingAlgorithm.startsWith("RSASSA");
  const isEccAlgorithm = signingAlgorithm.startsWith("ECDSA");

  if (isRsaKey && !isRsaAlgorithm) {
    throw new BadRequestError({
      message: `RSA key cannot be used with signing algorithm ${signingAlgorithm}`
    });
  }
  if (!isRsaKey && !isEccAlgorithm) {
    throw new BadRequestError({
      message: `ECC key cannot be used with signing algorithm ${signingAlgorithm}`
    });
  }
};

enum SigningGrantVerdict {
  NotApplicable = "not-applicable",
  Expired = "expired",
  ScopeMismatch = "scope-mismatch",
  Usable = "usable"
}

const classifyGrantForSigning = (
  grant: { expiresAt?: Date | null; attributes?: unknown },
  signerId: string,
  observedContext: TObservedSigningContext,
  now: Date
): { verdict: SigningGrantVerdict; mismatchedFields: CodeSigningScopeField[] } => {
  const attributes = grant.attributes as TCodeSigningGrantAttributes | null;
  if (!attributes || attributes.signerId !== signerId) {
    return { verdict: SigningGrantVerdict.NotApplicable, mismatchedFields: [] };
  }
  if (attributes.windowStart && new Date(attributes.windowStart) > now) {
    return { verdict: SigningGrantVerdict.NotApplicable, mismatchedFields: [] };
  }
  if (grant.expiresAt && new Date(grant.expiresAt) < now) {
    return { verdict: SigningGrantVerdict.Expired, mismatchedFields: [] };
  }

  const mismatchedFields = getCodeSigningScopeMismatches(attributes.scope, observedContext);
  if (mismatchedFields.length > 0) {
    return { verdict: SigningGrantVerdict.ScopeMismatch, mismatchedFields };
  }
  return { verdict: SigningGrantVerdict.Usable, mismatchedFields: [] };
};

type TResolvedHsmReissue = {
  isHsm: true;
  switchingKeySource: boolean;
  keyAlgorithm: CertKeyAlgorithm;
  hsmConnectorId: string;
  hsmKeyAlgorithm: HsmKeyAlgorithm;
};
type TResolvedInfisicalReissue = {
  isHsm: false;
  switchingKeySource: boolean;
  keyAlgorithm: CertKeyAlgorithm;
};
type TResolvedReissueTarget = TResolvedHsmReissue | TResolvedInfisicalReissue;

export const assertExternalConfigurationMatchesCaType = (
  externalConfiguration: TSignerExternalConfigurationInput | undefined,
  caType: CaType | null
) => {
  if (externalConfiguration?.caType && externalConfiguration.caType !== caType) {
    throw new BadRequestError({
      message: `externalConfiguration.caType '${externalConfiguration.caType}' does not match the type of the selected certificate authority ('${caType ?? "none"}').`
    });
  }
};

export const resolveReissueTarget = ({
  dto,
  signer,
  currentCert,
  requireNewKey = false
}: {
  dto: Pick<TReissueCertificateDTO, "keyAlgorithm" | "certificate">;
  signer: { keyAlgorithm?: string | null };
  requireNewKey?: boolean;
  currentCert: {
    keySource?: string | null;
    keyAlgorithm?: string | null;
    hsmConnectorId?: string | null;
  } | null;
}): TResolvedReissueTarget => {
  const currentIsHsm =
    currentCert?.keySource === CertKeySource.Hsm &&
    Boolean(currentCert.hsmConnectorId) &&
    Boolean(currentCert.keyAlgorithm);
  const overrideKeySource = dto.certificate?.keySource;
  // An algorithm change needs a fresh key, so treat it like a key source switch.
  const changingKeyAlgorithm = dto.keyAlgorithm !== undefined && dto.keyAlgorithm !== currentCert?.keyAlgorithm;
  const switchingKeySource =
    (overrideKeySource !== undefined && overrideKeySource !== currentCert?.keySource) ||
    changingKeyAlgorithm ||
    requireNewKey;
  const targetIsHsm = overrideKeySource ? overrideKeySource === CertKeySource.Hsm : currentIsHsm;

  if (targetIsHsm) {
    const hsmConnectorId = dto.certificate?.hsmConnectorId ?? currentCert?.hsmConnectorId ?? null;
    const keyAlgorithm =
      dto.keyAlgorithm ?? (currentCert?.keyAlgorithm as CertKeyAlgorithm | undefined) ?? CertKeyAlgorithm.RSA_2048;
    const hsmKeyAlgorithm = mapCertKeyAlgorithmToHsmKeyAlgorithm(keyAlgorithm);
    if (switchingKeySource && hsmKeyAlgorithm === HsmKeyAlgorithm.RSA_3072) {
      throw new BadRequestError({
        message: requireNewKey
          ? "The signer's certificate was revoked, so it needs a new HSM key, and a new HSM key can't be RSA-3072. Choose RSA-2048, RSA-4096, ECDSA P-256, or ECDSA P-384."
          : "A new HSM key can't be RSA-3072. Choose RSA-2048, RSA-4096, ECDSA P-256, or ECDSA P-384, or keep the signer's current key."
      });
    }
    if (!hsmConnectorId) {
      throw new BadRequestError({
        message: "hsmConnectorId is required to (re)issue with an HSM key source."
      });
    }
    return { isHsm: true, switchingKeySource, keyAlgorithm, hsmConnectorId, hsmKeyAlgorithm };
  }

  const keyAlgorithm = dto.keyAlgorithm ?? (signer.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048;
  return { isHsm: false, switchingKeySource, keyAlgorithm };
};

export const signerServiceFactory = ({
  signerDAL,
  signerRevocationDAL,
  signingOperationDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateService,
  signerIssuanceService,
  internalCertificateAuthorityService,
  digicertFns,
  projectDAL,
  kmsService,
  permissionService,
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalRequestDAL,
  approvalRequestGrantsDAL,
  membershipDAL,
  membershipRoleDAL,
  hsmConnectorService,
  licenseService,
  orgDAL,
  keyStore,
  userGroupMembershipDAL,
  notificationService,
  userDAL,
  auditLogService
}: TSignerServiceFactoryDep) => {
  const hsmCertIssuanceDeps = {
    certificateAuthorityDAL,
    internalCertificateAuthorityService,
    certificateBodyDAL,
    certificateDAL,
    hsmConnectorService,
    projectDAL,
    kmsService
  };
  const softwareCertIssuanceDeps = {
    certificateAuthorityDAL,
    internalCertificateAuthorityService,
    certificateBodyDAL,
    certificateSecretDAL,
    projectDAL,
    kmsService
  };

  const $loadSignerResourcePermission = async (
    signerId: string,
    projectId: string,
    actor: TGetSignerDTO["actor"],
    actorId: string,
    actorAuthMethod: TGetSignerDTO["actorAuthMethod"],
    actorOrgId?: string
  ) =>
    permissionService.getResourcePermission({
      actor,
      actorId,
      projectId,
      resourceType: ResourceType.Signer,
      resourceId: signerId,
      actorAuthMethod,
      actorOrgId
    });

  const $readFreshSigner = (signerId: string) =>
    signerDAL.transaction((tx) => signerDAL.findByIdWithCertificate(signerId, tx));

  const $withLockedSigner = async <T>(
    dto: TGetSignerDTO,
    action: ResourcePermissionSignerActions,
    fn: (signer: TSignerWithCertificate) => Promise<T>
  ): Promise<T> => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.Signer);

    return withSignerCertificateLock(
      keyStore,
      signer.id,
      () => {
        throw new BadRequestError({ message: signerCertificateLockHeldMessage(signer.name) });
      },
      async () => {
        const freshSigner = await $readFreshSigner(signer.id);
        if (!freshSigner) throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
        return fn(freshSigner);
      }
    );
  };

  const $updateUnlessRevoked = async (
    signer: Pick<TPkiSigners, "id" | "name">,
    data: Parameters<typeof signerDAL.updateUnlessRevoked>[1],
    tx?: Knex
  ) => {
    const updated = await signerDAL.updateUnlessRevoked(signer.id, data, tx);
    if (!updated) throw new BadRequestError({ message: revokedCertificateMessage(signer.name) });
    return updated;
  };

  const $issueInternalCaCertificate = async (input: {
    caId: string;
    projectId: string;
    commonName: string;
    certificateTtlDays?: number;
    keyAlgorithm: CertKeyAlgorithm;
    certificate?: TCreateSignerDTO["certificate"];
    actor: Parameters<typeof hsmConnectorService.assertAttachPermission>[0];
  }): Promise<string> => {
    const { caId, projectId, commonName, certificateTtlDays, keyAlgorithm, certificate, actor } = input;
    const ttlDays = certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS;

    if (certificate?.keySource === CertKeySource.Hsm) {
      if (!certificate.hsmConnectorId) {
        throw new BadRequestError({ message: "hsmConnectorId is required when certificate.keySource = 'hsm'." });
      }
      await hsmConnectorService.assertAttachPermission(actor, certificate.hsmConnectorId, projectId);
      const { certificateId } = await issueHsmBackedSignerCertificate(hsmCertIssuanceDeps, {
        caId,
        projectId,
        commonName,
        certificateTtlDays: ttlDays,
        hsmConnectorId: certificate.hsmConnectorId,
        hsmKeyAlgorithm: mapCertKeyAlgorithmToHsmKeyAlgorithm(keyAlgorithm)
      });
      return certificateId;
    }

    const { certificateId } = await issueSignerCertificate(softwareCertIssuanceDeps, {
      caId,
      projectId,
      commonName,
      certificateTtlDays: ttlDays,
      keyAlgorithm
    });
    return certificateId;
  };

  const $parseDigiCertOrderId = (
    value: string | undefined,
    caType: CaType | null,
    field: "reissueFromExternalOrderId" | "importFromExternalOrderId" | "externalOrderId"
  ): number | undefined => {
    if (!value) return undefined;
    if (caType !== CaType.DIGICERT) {
      throw new BadRequestError({
        message: `${field === "reissueFromExternalOrderId" ? "Reissuing from an existing order" : "Using the certificate from an existing order"} is only supported for DigiCert code signing certificate authorities.`
      });
    }
    const orderId = Number(value);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new BadRequestError({ message: `${field} must be a valid DigiCert order id.` });
    }
    return orderId;
  };

  const $verifyExistingDigiCertCertificate = async (input: {
    caId: string;
    projectId: string;
    orderId: number;
    certificate?: TSignerCertificateInput;
    actor: Parameters<typeof hsmConnectorService.assertAttachPermission>[0];
  }) => {
    const { caId, projectId, orderId } = input;
    const hsmConnectorId = input.certificate?.hsmConnectorId;
    const hsmKeyLabel = input.certificate?.hsmKeyLabel;
    const requestedHsmKeyId = input.certificate?.hsmKeyId;
    if (input.certificate?.keySource !== CertKeySource.Hsm || !hsmConnectorId || !hsmKeyLabel) {
      throw new BadRequestError({
        message:
          "Using an existing DigiCert certificate requires an HSM Connector and the label of the certificate's private key on that HSM."
      });
    }
    const hsmConnector = await hsmConnectorService.assertAttachPermission(input.actor, hsmConnectorId, projectId);

    const { pemBundle, certificate } = await digicertFns.fetchIssuedCodeSigningCertificate(caId, orderId);
    const { keyAlgorithm } = extractCertificateAlgorithms(certificate);
    if (!keyAlgorithm || !IMPORTABLE_HSM_KEY_ALGORITHMS.includes(keyAlgorithm)) {
      throw new BadRequestError({
        message: `The certificate in DigiCert order ${orderId} uses an unsupported key type (${keyAlgorithm ?? "unknown"}). Supported key types are RSA-3072, RSA-4096, ECDSA P-256, and ECDSA P-384.`
      });
    }

    const { hsmKeyId } = await assertHsmKeyMatchesCertificate(
      { hsmConnectorService },
      { hsmConnectorId, projectId, hsmKeyLabel, hsmKeyId: requestedHsmKeyId, certificate }
    );

    const validityDays = Math.round(
      (certificate.notAfter.getTime() - certificate.notBefore.getTime()) / (24 * 60 * 60 * 1000)
    );
    return {
      orderId,
      projectId,
      pemBundle,
      hsmConnectorName: hsmConnector.name,
      hsm: {
        keySource: CertKeySource.Hsm,
        hsmConnectorId,
        hsmKeyLabel,
        hsmKeyId: hsmKeyId ?? requestedHsmKeyId ?? null,
        hsmPublicKeySpki: Buffer.from(certificate.publicKey.rawData)
      },
      commonName: certificate.subjectName.getField("CN")[0] || IMPORTED_CERTIFICATE_FALLBACK_COMMON_NAME,
      certificateTtlDays: Math.min(Math.max(validityDays, 1), MAX_CS_VALIDITY_DAYS),
      keyAlgorithm: keyAlgorithm as CertKeyAlgorithm
    };
  };

  const $importExistingDigiCertCertificate = async (
    input: Parameters<typeof $verifyExistingDigiCertCertificate>[0]
  ) => {
    const { pemBundle, ...verified } = await $verifyExistingDigiCertCertificate(input);
    const preparedCertificate = await digicertFns.prepareCodeSigningCertificateImport({
      caId: input.caId,
      orderId: input.orderId,
      pemBundle
    });
    return { ...verified, preparedCertificate };
  };

  const checkCertificateImport = async (dto: TCheckCertificateImportDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Create,
      ProjectPermissionSub.CodeSigners
    );
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(dto.caId);
    if (!ca || ca.projectId !== dto.projectId) {
      throw new NotFoundError({ message: `Certificate authority '${dto.caId}' not found in this organization.` });
    }
    const caType: CaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
    const orderId = $parseDigiCertOrderId(dto.externalOrderId, caType, "externalOrderId") as number;
    const verified = await $verifyExistingDigiCertCertificate({
      caId: ca.id,
      projectId: dto.projectId,
      orderId,
      certificate: { keySource: CertKeySource.Hsm, ...dto.certificate },
      actor: { type: dto.actor, id: dto.actorId, authMethod: dto.actorAuthMethod, orgId: dto.actorOrgId }
    });
    return {
      hsmKeyId: verified.hsm.hsmKeyId,
      commonName: verified.commonName,
      certificateTtlDays: verified.certificateTtlDays,
      keyAlgorithm: verified.keyAlgorithm
    };
  };

  const $attachImportedCertificate = async (
    imported: Awaited<ReturnType<typeof $importExistingDigiCertCertificate>>,
    signerId: string | undefined,
    tx: Knex
  ) => {
    const { preparedCertificate } = imported;
    const certificateId = preparedCertificate.insert
      ? await preparedCertificate.insert(tx)
      : preparedCertificate.existingCertificateId;
    const lockedCertificate = await certificateDAL.findByIdForUpdate(certificateId, tx);
    if (!lockedCertificate) {
      throw new NotFoundError({ message: `The certificate in DigiCert order ${imported.orderId} no longer exists.` });
    }
    assertCertificateNotDeleted(lockedCertificate, "It can't be used by a signer.");
    const signerUsingCertificate = await signerDAL.findOne({ certificateId }, tx);
    if (signerUsingCertificate && signerUsingCertificate.id !== signerId) {
      throw new ConflictError({
        message: `The certificate in DigiCert order ${imported.orderId} is already used by signer '${signerUsingCertificate.name}'.`
      });
    }
    await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
      `signer-hsm-key:${imported.hsm.hsmPublicKeySpki.toString("hex")}`
    ]);
    const signerUsingKey = await signerDAL.findOneInOrgByCurrentHsmPublicKey(
      imported.projectId,
      imported.hsm.hsmPublicKeySpki,
      signerId,
      tx
    );
    if (signerUsingKey) {
      throw new ConflictError({
        message: `The private key of the certificate in DigiCert order ${imported.orderId} is already used by another signer. Each signer needs its own key.`
      });
    }
    await certificateDAL.updateById(certificateId, imported.hsm, tx);
    return certificateId;
  };

  const $rethrowConcurrentImport = async (
    error: unknown,
    imported: Awaited<ReturnType<typeof $importExistingDigiCertCertificate>> | null
  ) => {
    if (
      imported?.preparedCertificate.insert &&
      error instanceof DatabaseError &&
      (error.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation &&
      (await imported.preparedCertificate.findConcurrentInsert())
    ) {
      throw new ConflictError({
        message: `The certificate in DigiCert order ${imported.orderId} was attached to a signer by another request at the same time. Refresh and try again.`
      });
    }
  };

  const create = async (dto: TCreateSignerDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Create,
      ProjectPermissionSub.CodeSigners
    );

    const plan = await licenseService.getPlan(dto.actorOrgId);
    if (!plan.has(PlanFeature.PkiCodeSigning)) {
      throw new BadRequestError({
        message: "Failed to create code signer due to plan restriction. Upgrade plan to access PKI code signing."
      });
    }

    const usingExistingCert = Boolean(dto.certificateId);
    const usingCa = Boolean(dto.caId);
    if (usingExistingCert === usingCa) {
      throw new BadRequestError({
        message:
          "Provide either certificateId (bring an existing certificate) or caId + commonName (issue a fresh one)."
      });
    }

    if (usingCa && dto.certificateRenewBeforeDays != null) {
      const ttl = dto.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS;
      if (dto.certificateRenewBeforeDays >= ttl) {
        throw new BadRequestError({
          message: `Renew before (${dto.certificateRenewBeforeDays}d) must be less than the certificate validity (${ttl}d).`
        });
      }
    }

    if (usingExistingCert) {
      const certificate = await certificateDAL.findById(dto.certificateId as string);
      if (!certificate) {
        throw new NotFoundError({ message: `Certificate with ID '${dto.certificateId}' not found` });
      }
      if (certificate.projectId !== dto.projectId) {
        throw new BadRequestError({ message: "Certificate must belong to the same organization" });
      }
      assertCertificateNotDeleted(certificate, "It can't be used by a signer.");
      if (certificate.status === CertStatus.REVOKED) {
        throw new BadRequestError({ message: "Certificate has been revoked" });
      }
      if (certificate.notAfter && new Date(certificate.notAfter) < new Date()) {
        throw new BadRequestError({ message: "Certificate has expired" });
      }
      const extendedKeyUsages = certificate.extendedKeyUsages as string[] | null;
      if (!extendedKeyUsages?.includes(CertExtendedKeyUsage.CODE_SIGNING)) {
        throw new BadRequestError({ message: "Certificate must have the codeSigning extended key usage" });
      }
      const certSecret = await certificateSecretDAL.findOne({ certId: dto.certificateId as string });
      if (!certSecret) {
        throw new BadRequestError({ message: "Certificate must have an associated private key" });
      }
    }

    let resolvedCaId: string | null = null;
    let resolvedCaType: CaType | null = null;
    if (usingCa) {
      if (!dto.commonName && !dto.externalConfiguration?.importFromExternalOrderId) {
        throw new BadRequestError({ message: "commonName is required when issuing a certificate from a CA." });
      }
      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(dto.caId as string);
      if (!ca || ca.projectId !== dto.projectId) {
        throw new NotFoundError({ message: `Certificate authority '${dto.caId}' not found in this organization.` });
      }
      if (ca.status !== CaStatus.ACTIVE) {
        throw new BadRequestError({ message: "The selected certificate authority is not active." });
      }
      resolvedCaId = ca.id;
      resolvedCaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
    }

    if (resolvedCaType) assertCaTypeSupportsCodeSigning(resolvedCaType);
    assertExternalConfigurationMatchesCaType(dto.externalConfiguration, resolvedCaType);

    let createDigicertLifecycle: { mode: DigiCertLifecycleMode.Reissue; previousOrderId: number } | undefined;
    const createExternalConfig = dto.externalConfiguration;
    const reissueOrderId = $parseDigiCertOrderId(
      createExternalConfig?.reissueFromExternalOrderId,
      resolvedCaType,
      "reissueFromExternalOrderId"
    );
    const importOrderId = $parseDigiCertOrderId(
      createExternalConfig?.importFromExternalOrderId,
      resolvedCaType,
      "importFromExternalOrderId"
    );
    if (reissueOrderId) {
      await digicertFns.assertCodeSigningOrderReusable(resolvedCaId as string, reissueOrderId);
      createDigicertLifecycle = { mode: DigiCertLifecycleMode.Reissue, previousOrderId: reissueOrderId };
    }

    const isExternalCa = resolvedCaType !== null && resolvedCaType !== CaType.INTERNAL;

    const adcsTemplate = createExternalConfig?.template?.trim() || undefined;
    if (adcsTemplate && resolvedCaType !== CaType.ADCS) {
      throw new BadRequestError({
        message:
          "A certificate template can only be set for signers backed by an Active Directory Certificate Service CA."
      });
    }
    if (resolvedCaType === CaType.ADCS && !adcsTemplate) {
      throw new BadRequestError({
        message: "A certificate template is required for signers backed by an Active Directory Certificate Service CA."
      });
    }
    const externalCaConfig: TSignerExternalCaConfig | null = adcsTemplate
      ? { caType: CaType.ADCS, template: adcsTemplate }
      : null;

    if (
      (resolvedCaType === CaType.AZURE_AD_CS || resolvedCaType === CaType.ADCS) &&
      dto.certificate?.keySource === CertKeySource.Hsm
    ) {
      throw new BadRequestError({
        message:
          "HSM-backed signers are not supported with AD CS yet. Use AWS Private CA, an Internal CA, or switch the signer's key source to Infisical-managed."
      });
    }

    const importedCertificate =
      importOrderId && resolvedCaId
        ? await $importExistingDigiCertCertificate({
            caId: resolvedCaId,
            projectId: dto.projectId,
            orderId: importOrderId,
            certificate: dto.certificate,
            actor: { type: dto.actor, id: dto.actorId, authMethod: dto.actorAuthMethod, orgId: dto.actorOrgId }
          })
        : null;

    if (
      importedCertificate &&
      dto.certificateRenewBeforeDays != null &&
      dto.certificateRenewBeforeDays >= importedCertificate.certificateTtlDays
    ) {
      throw new BadRequestError({
        message: `Renew before (${dto.certificateRenewBeforeDays}d) must be less than the validity of the certificate in DigiCert order ${importOrderId} (${importedCertificate.certificateTtlDays}d).`
      });
    }

    const keyAlgorithm: CertKeyAlgorithm =
      importedCertificate?.keyAlgorithm ?? (dto.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048;

    let issuedCertificateId: string | null = null;
    if (usingCa && resolvedCaId && !isExternalCa) {
      issuedCertificateId = await $issueInternalCaCertificate({
        caId: resolvedCaId,
        projectId: dto.projectId,
        commonName: dto.commonName as string,
        certificateTtlDays: dto.certificateTtlDays,
        keyAlgorithm,
        certificate: dto.certificate,
        actor: { type: dto.actor, id: dto.actorId, authMethod: dto.actorAuthMethod, orgId: dto.actorOrgId }
      });
    }

    const finalCertificateId = usingExistingCert ? (dto.certificateId as string) : issuedCertificateId;
    const initialStatus: SignerStatus =
      isExternalCa && !importedCertificate ? SignerStatus.Pending : SignerStatus.Active;

    try {
      const result = await signerDAL.transaction(async (tx) => {
        if (usingExistingCert) {
          const lockedCertificate = await certificateDAL.findByIdForShare(dto.certificateId as string, tx);
          if (!lockedCertificate) {
            throw new NotFoundError({ message: `Certificate with ID '${dto.certificateId}' not found` });
          }
          assertCertificateNotDeleted(lockedCertificate, "It can't be used by a signer.");
        }

        const importedCertificateId = importedCertificate
          ? await $attachImportedCertificate(importedCertificate, undefined, tx)
          : null;
        const project = await projectDAL.findOne({ id: dto.projectId }, tx);
        if (!project) {
          throw new NotFoundError({ message: "Certificate Manager has not been set up for this organization." });
        }
        const policy = await approvalPolicyDAL.create(
          {
            projectId: dto.projectId,
            organizationId: project.orgId,
            type: ApprovalPolicyType.CertCodeSigning,
            name: `signer:pending`,
            scopeType: ApprovalPolicyScope.Signer,
            scopeId: null,
            conditions: {},
            constraints: {}
          },
          tx
        );

        const signer = await signerDAL.create(
          {
            projectId: dto.projectId,
            name: dto.name,
            description: dto.description,
            certificateId: importedCertificateId ?? finalCertificateId,
            caId: resolvedCaId,
            commonName: usingCa ? (importedCertificate?.commonName ?? dto.commonName) : null,
            certificateTtlDays: usingCa
              ? (importedCertificate?.certificateTtlDays ?? dto.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS)
              : null,
            certificateRenewBeforeDays: usingCa ? (dto.certificateRenewBeforeDays ?? null) : null,
            keyAlgorithm,
            status: initialStatus,
            approvalPolicyId: policy.id,
            certificateFailureReason: null,
            externalCaConfig
          },
          tx
        );

        await approvalPolicyDAL.updateById(
          policy.id,
          {
            scopeId: signer.id,
            name: `signer:${signer.id}`
          },
          tx
        );

        if (dto.actor === ActorType.USER && dto.actorOrgId) {
          const newMembership = await membershipDAL.create(
            {
              scope: RESOURCE_SCOPE,
              scopeOrgId: dto.actorOrgId,
              scopeProjectId: dto.projectId,
              actorUserId: dto.actorId,
              scopeResourceType: ResourceType.Signer,
              scopeResourceId: signer.id,
              isActive: true
            },
            tx
          );
          await membershipRoleDAL.create({ membershipId: newMembership.id, role: ResourceMembershipRole.Admin }, tx);
        }

        const pendingMembers = (dto.members ?? []).filter(
          (m) => !(m.kind === "user" && dto.actor === ActorType.USER && m.id === dto.actorId)
        );
        if (pendingMembers.length > 0 && !dto.actorOrgId) {
          throw new BadRequestError({
            message: "Cannot add members during signer creation without an organization context."
          });
        }

        if (pendingMembers.length > 0) {
          const pendingUserIds = pendingMembers.filter((m) => m.kind === "user").map((m) => m.id);
          const pendingIdentityIds = pendingMembers.filter((m) => m.kind === "identity").map((m) => m.id);
          const pendingGroupIds = pendingMembers.filter((m) => m.kind === "group").map((m) => m.id);

          const [userRows, identityRows, groupRows] = await Promise.all([
            pendingUserIds.length
              ? membershipDAL.find(
                  {
                    scope: AccessScope.Project,
                    scopeProjectId: dto.projectId,
                    $in: { actorUserId: pendingUserIds }
                  },
                  { tx }
                )
              : Promise.resolve([] as Awaited<ReturnType<typeof membershipDAL.find>>),
            pendingIdentityIds.length
              ? membershipDAL.find(
                  {
                    scope: AccessScope.Project,
                    scopeProjectId: dto.projectId,
                    $in: { actorIdentityId: pendingIdentityIds }
                  },
                  { tx }
                )
              : Promise.resolve([] as Awaited<ReturnType<typeof membershipDAL.find>>),
            pendingGroupIds.length
              ? membershipDAL.find(
                  {
                    scope: AccessScope.Project,
                    scopeProjectId: dto.projectId,
                    $in: { actorGroupId: pendingGroupIds }
                  },
                  { tx }
                )
              : Promise.resolve([] as Awaited<ReturnType<typeof membershipDAL.find>>)
          ]);
          const validUserIds = new Set(userRows.map((m) => m.actorUserId).filter((v): v is string => Boolean(v)));
          const validIdentityIds = new Set(
            identityRows.map((m) => m.actorIdentityId).filter((v): v is string => Boolean(v))
          );
          const validGroupIds = new Set(groupRows.map((m) => m.actorGroupId).filter((v): v is string => Boolean(v)));
          for (const m of pendingMembers) {
            const ok =
              (m.kind === "user" && validUserIds.has(m.id)) ||
              (m.kind === "identity" && validIdentityIds.has(m.id)) ||
              (m.kind === "group" && validGroupIds.has(m.id));
            if (!ok) {
              // eslint-disable-next-line no-nested-ternary
              const subjectLabel = m.kind === "user" ? "user" : m.kind === "identity" ? "machine identity" : "group";
              throw new BadRequestError({
                message: `Cannot add ${subjectLabel} ${m.id} to the signer: grant them access under Access Control first.`
              });
            }
          }

          await lockAndAssertActiveOrgAccess(
            { orgDAL, orgId: dto.actorOrgId, userIds: pendingUserIds, identityIds: pendingIdentityIds },
            tx
          );
        }

        for (const member of pendingMembers) {
          if (!isBuiltInSignerRole(member.role)) {
            throw new BadRequestError({ message: unknownSignerRoleMessage(member.role) });
          }
          const membershipFields = {
            scope: RESOURCE_SCOPE,
            scopeOrgId: dto.actorOrgId,
            scopeProjectId: dto.projectId,
            scopeResourceType: ResourceType.Signer,
            scopeResourceId: signer.id,
            isActive: true,
            actorUserId: member.kind === "user" ? member.id : null,
            actorIdentityId: member.kind === "identity" ? member.id : null,
            actorGroupId: member.kind === "group" ? member.id : null
          };
          // eslint-disable-next-line no-await-in-loop
          const newMembership = await membershipDAL.create(membershipFields, tx);
          // eslint-disable-next-line no-await-in-loop
          await membershipRoleDAL.create({ membershipId: newMembership.id, role: member.role }, tx);
        }

        const { approvalPolicy } = dto;
        if (approvalPolicy && approvalPolicy.steps.length > 0) {
          const effectiveConstraints = approvalPolicy.constraints ?? {};

          const allowedApproverIds = new Set<string>();
          if (dto.actor === ActorType.USER) allowedApproverIds.add(dto.actorId);
          const allowedGroupApproverIds = new Set<string>();
          for (const m of pendingMembers) {
            if (m.role !== ResourceMembershipRole.Auditor) {
              if (m.kind === "user") allowedApproverIds.add(m.id);
              else if (m.kind === "group") allowedGroupApproverIds.add(m.id);
            }
          }

          for (const step of approvalPolicy.steps) {
            const stepApproverGroupIds = step.approverGroupIds ?? [];
            const stepApproverUserCount = step.approverUserIds.length;
            const stepApproverGroupCount = stepApproverGroupIds.length;
            if (stepApproverUserCount + stepApproverGroupCount === 0) {
              throw new BadRequestError({
                message: `Step ${step.stepNumber}: at least one approver is required.`
              });
            }
            if (step.requiredApprovals < 1) {
              throw new BadRequestError({
                message: `Step ${step.stepNumber}: requiredApprovals must be at least 1.`
              });
            }
            if (stepApproverGroupCount === 0 && step.requiredApprovals > stepApproverUserCount) {
              throw new BadRequestError({
                message: `Step ${step.stepNumber}: requiredApprovals (${step.requiredApprovals}) can't exceed the number of approvers (${stepApproverUserCount}). Add a group to allow more than the current user approvers.`
              });
            }
            for (const userId of step.approverUserIds) {
              if (!allowedApproverIds.has(userId)) {
                throw new BadRequestError({
                  message: `Step ${step.stepNumber}: approver '${userId}' is not a member of the signer or is an auditor.`
                });
              }
            }
            for (const groupId of stepApproverGroupIds) {
              if (!allowedGroupApproverIds.has(groupId)) {
                throw new BadRequestError({
                  message: `Step ${step.stepNumber}: approver group '${groupId}' is not a member of the signer or is an auditor.`
                });
              }
            }
            // eslint-disable-next-line no-await-in-loop
            const createdStep = await approvalPolicyStepsDAL.create(
              {
                policyId: policy.id,
                stepNumber: step.stepNumber,
                name: step.name?.trim() || null,
                requiredApprovals: step.requiredApprovals
              },
              tx
            );
            for (const userId of step.approverUserIds) {
              // eslint-disable-next-line no-await-in-loop
              await approvalPolicyStepApproversDAL.create({ policyStepId: createdStep.id, userId }, tx);
            }
            for (const groupId of stepApproverGroupIds) {
              // eslint-disable-next-line no-await-in-loop
              await approvalPolicyStepApproversDAL.create({ policyStepId: createdStep.id, groupId }, tx);
            }
          }

          await approvalPolicyDAL.updateById(
            policy.id,
            {
              constraints: {
                constraints: {
                  maxSignings: effectiveConstraints.maxSignings ?? null,
                  maxWindowDuration: effectiveConstraints.maxWindowDuration ?? null
                }
              }
            },
            tx
          );
        }

        return { ...signer, approvalPolicyId: policy.id };
      });

      if (usingCa && resolvedCaId && isExternalCa && resolvedCaType && !importedCertificate) {
        try {
          const certificateInput = dto.certificate;
          await signerIssuanceService.requestIssuance({
            signerId: result.id,
            projectId: dto.projectId,
            caId: resolvedCaId,
            commonName: dto.commonName as string,
            certificateTtlDays: dto.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS,
            keyAlgorithm,
            digicertLifecycle: createDigicertLifecycle,
            hsm:
              certificateInput?.keySource === CertKeySource.Hsm && certificateInput.hsmConnectorId
                ? {
                    hsmConnectorId: certificateInput.hsmConnectorId,
                    hsmKeyAlgorithm: mapCertKeyAlgorithmToHsmKeyAlgorithm(keyAlgorithm),
                    actor: {
                      type: dto.actor,
                      id: dto.actorId,
                      authMethod: dto.actorAuthMethod,
                      orgId: dto.actorOrgId
                    }
                  }
                : undefined
          });
        } catch (queueErr) {
          logger.error(
            queueErr,
            `signer create: failed to enqueue async issuance — marking signer Failed [signerId=${result.id}]`
          );
          await signerDAL.updateById(result.id, {
            status: SignerStatus.Failed,
            certificateFailureReason: formatSignerIssuanceErrorReason(
              queueErr,
              "Could not schedule issuance from the external Certificate Authority"
            )
          });
        }
      }

      return result;
    } catch (error) {
      await $rethrowConcurrentImport(error, importedCertificate);
      // 23505 = unique constraint violation
      if (error instanceof DatabaseError && (error.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({
          message: `A signer with the name '${dto.name}' already exists in this organization`
        });
      }
      throw error;
    }
  };

  const list = async (dto: TListSignersDTO) => {
    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCodeSigningActions.Read,
      ProjectPermissionSub.CodeSigners
    );

    let signerIds: string[] | undefined;
    if (!hasRole(ProjectMembershipRole.Admin)) {
      const memberships = await membershipDAL.findResourceMembershipsForActor({
        projectId: dto.projectId,
        resourceType: ResourceType.Signer,
        actorType: dto.actor === ActorType.IDENTITY ? ActorType.IDENTITY : ActorType.USER,
        actorId: dto.actorId
      });
      signerIds = Array.from(
        new Set(memberships.map((m) => m.scopeResourceId).filter((id): id is string => Boolean(id)))
      );
      if (signerIds.length === 0) {
        return { signers: [], totalCount: 0 };
      }
    }

    const signers = await signerDAL.findByProjectId(dto.projectId, {
      offset: dto.offset,
      limit: dto.limit,
      search: dto.search,
      signerIds
    });

    const totalCount = await signerDAL.countByProjectId(dto.projectId, dto.search, signerIds);

    return {
      signers: signers.map((s) => ({ ...s, status: computeEffectiveStatus(s) })),
      totalCount
    };
  };

  const getById = async (dto: TGetSignerDTO) => {
    const signer = await signerDAL.findByIdWithCertificate(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Read, ResourcePermissionSub.Signer);

    type TExternalOrder = { provider: string; orderId: number; status: string | null };
    let externalOrder: TExternalOrder | null = null;
    let certificateRequest: {
      status: TSignerCertificateRequestStatus;
      failureReason: string | null;
      externalOrder: TExternalOrder | null;
    } | null = null;
    const latestRequest = await signerIssuanceService.getLatestIssuanceRequest(signer.id);
    if (latestRequest) {
      certificateRequest = {
        status: latestRequest.status,
        failureReason: latestRequest.failureReason,
        externalOrder: latestRequest.externalOrder
      };
      if (!signer.certificateId) {
        signer.certificateKeySource = signer.certificateKeySource ?? latestRequest.keySource;
        signer.certificateHsmConnectorId = signer.certificateHsmConnectorId ?? latestRequest.hsmConnectorId;
        signer.certificateKeyAlgorithm = signer.certificateKeyAlgorithm ?? latestRequest.keyAlgorithm;
        signer.certificateHsmKeyLabel = signer.certificateHsmKeyLabel ?? latestRequest.hsmKeyLabel;
        externalOrder = latestRequest.externalOrder;
      }
    }

    const issuedOrder = DigiCertExternalMetadataSchema.safeParse(signer.certificateExternalMetadata);
    if (signer.certificateId && issuedOrder.success) {
      externalOrder = {
        provider: CaType.DIGICERT,
        orderId: issuedOrder.data.orderId,
        status:
          signer.certificateStatus === CertStatus.REVOKED
            ? CodeSigningOrderStatus.Revoked
            : CodeSigningOrderStatus.Issued
      };
    }

    const revocation =
      signer.status === SignerStatus.RevocationPending
        ? await signerRevocationDAL.findUnsettledForSigner(signer.id)
        : null;

    return {
      ...signer,
      status: computeEffectiveStatus(signer),
      externalOrder,
      certificateRequest,
      revocation: revocation
        ? {
            status: revocation.status as TUnsettledSignerRevocationStatus,
            caRequestId: revocation.caRequestId ?? null,
            failureReason: revocation.failureReason ?? null
          }
        : null
    };
  };

  const checkIssuanceNow = async (dto: TGetSignerDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ReissueCertificate,
      ResourcePermissionSub.Signer
    );

    await signerIssuanceService.runPendingJobNow(signer.id);
    return getById(dto);
  };

  const getMyPermissions = async (dto: TGetSignerDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission, memberships } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );

    return {
      permissions: packRules(permission.rules),
      memberships
    };
  };

  const update = async (dto: TUpdateSignerDTO) => {
    const existingSigner = await signerDAL.findById(dto.signerId);
    if (!existingSigner) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { projectId } = existingSigner;

    const { permission } = await $loadSignerResourcePermission(
      existingSigner.id,
      projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Edit, ResourcePermissionSub.Signer);

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.certificateRenewBeforeDays !== undefined) {
      if (dto.certificateRenewBeforeDays === null) {
        patch.certificateRenewBeforeDays = null;
      } else {
        if (dto.certificateRenewBeforeDays < 1 || dto.certificateRenewBeforeDays > 30) {
          throw new BadRequestError({ message: "Renew before must be between 1 and 30 days." });
        }
        if (
          existingSigner.certificateTtlDays != null &&
          dto.certificateRenewBeforeDays >= existingSigner.certificateTtlDays
        ) {
          throw new BadRequestError({
            message: `Renew before (${dto.certificateRenewBeforeDays}d) must be less than the certificate validity (${existingSigner.certificateTtlDays}d).`
          });
        }
        patch.certificateRenewBeforeDays = dto.certificateRenewBeforeDays;
      }
    }

    if (Object.keys(patch).length === 0) {
      return existingSigner;
    }

    return signerDAL.updateById(dto.signerId, patch);
  };

  const deleteSigner = async (dto: TDeleteSignerDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.Delete, async (existingSigner) => {
      await signerIssuanceService.cleanUpRequestsBeforeDelete(existingSigner.id);

      // Revoke the DigiCert order so a deleted signer can't leave a live publicly-trusted cert behind.
      // Best-effort and outside the deletion transaction so a DigiCert outage can't block the delete.
      if (existingSigner.certificateId) {
        try {
          const cert = await certificateDAL.findById(existingSigner.certificateId);
          const ca = cert?.caId ? await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId) : null;
          if (ca?.externalCa?.type === CaType.DIGICERT) {
            if (cert?.serialNumber && cert.status !== CertStatus.REVOKED) {
              await digicertFns.revokeCertificate({
                caId: ca.id,
                serialNumber: cert.serialNumber,
                reason: CrlReason.CESSATION_OF_OPERATION
              });
              logger.info(
                `signer delete: revoked DigiCert order for deleted signer [signerId=${existingSigner.id}] [certificateId=${cert.id}]`
              );
            }
          }
        } catch (err) {
          logger.error(
            err,
            `signer delete: failed to revoke DigiCert order for signer '${existingSigner.name}' [signerId=${existingSigner.id}] [certificateId=${existingSigner.certificateId}] — deletion will proceed; revoke the order manually in CertCentral`
          );
        }
      }

      await signerDAL.transaction(async (tx) => {
        const memberships = await membershipDAL.find(
          {
            scope: RESOURCE_SCOPE,
            scopeResourceType: ResourceType.Signer,
            scopeResourceId: existingSigner.id
          },
          { tx }
        );
        if (memberships.length > 0) {
          const ids = memberships.map((m) => m.id);
          await membershipRoleDAL.delete({ $in: { membershipId: ids } }, tx);
          await membershipDAL.delete({ $in: { id: ids } }, tx);
        }

        await approvalRequestDAL.delete({ scopeType: ApprovalPolicyScope.Signer, scopeId: existingSigner.id }, tx);

        await signerDAL.deleteById(dto.signerId, tx);

        await approvalPolicyDAL.delete({ scopeType: ApprovalPolicyScope.Signer, scopeId: existingSigner.id }, tx);
      });

      return existingSigner;
    });

  const enable = async (dto: TEnableSignerDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.ManageStatus, async (signer) => {
      if (signer.status !== SignerStatus.Disabled) {
        throw new BadRequestError({
          message: `Signer '${signer.name}' is not disabled (current status: ${signer.status}).`
        });
      }
      if (!signer.certificateId) {
        throw new BadRequestError({
          message: `Signer '${signer.name}' has no certificate. Reissue from a CA before enabling.`
        });
      }
      return $updateUnlessRevoked(signer, { status: SignerStatus.Active });
    });

  const disable = async (dto: TDisableSignerDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.ManageStatus, async (signer) => {
      assertSignerNotRevoked(signer);
      if (signer.status === SignerStatus.Disabled) return signer;
      return $updateUnlessRevoked(signer, { status: SignerStatus.Disabled });
    });

  type TReissueParams = Pick<
    TReissueCertificateDTO,
    "caId" | "commonName" | "certificateTtlDays" | "keyAlgorithm" | "certificate" | "externalConfiguration"
  >;
  type TSignerActor = Pick<TReissueCertificateDTO, "actor" | "actorId" | "actorAuthMethod" | "actorOrgId">;

  type TReissueExecutionContext = {
    params: TReissueParams;
    actor?: TSignerActor;
    signer: TSignerWithCertificate;
    target: ReturnType<typeof resolveReissueTarget>;
    currentCert: Awaited<ReturnType<typeof certificateDAL.findById>> | null;
    recoveredKeyConfig: Awaited<ReturnType<typeof signerIssuanceService.getLatestIssuanceRequest>>;
    commonName: string;
    certificateTtlDays: number;
    digicertReissueOrderId?: number;
    isRenewal: boolean;
    tracksRequestStatus: boolean;
  };

  const $toHsmActor = (actor?: TSignerActor) =>
    actor
      ? { type: actor.actor, id: actor.actorId, authMethod: actor.actorAuthMethod, orgId: actor.actorOrgId }
      : undefined;

  const $recordReissueFailure = (ctx: TReissueExecutionContext, err: unknown, fallbackReason: string) =>
    signerDAL.updateUnlessRevoked(ctx.signer.id, {
      ...(ctx.tracksRequestStatus ? { status: SignerStatus.Failed } : {}),
      certificateFailureReason: formatSignerIssuanceErrorReason(err, fallbackReason)
    });

  const $reissueExternalSigner = async (ctx: TReissueExecutionContext) => {
    const { signer, target, currentCert, recoveredKeyConfig } = ctx;
    const reusedHsmKeyRow = currentCert?.hsmKeyLabel ? currentCert : recoveredKeyConfig;
    const reissueHsm = target.isHsm
      ? {
          hsmConnectorId: target.hsmConnectorId,
          hsmKeyAlgorithm: target.hsmKeyAlgorithm,
          hsmKeyLabel: target.switchingKeySource
            ? undefined
            : (currentCert?.hsmKeyLabel ?? recoveredKeyConfig?.hsmKeyLabel ?? undefined),
          hsmKeyId: target.switchingKeySource ? undefined : reusedHsmKeyRow?.hsmKeyId,
          hsmPublicKeySpki: target.switchingKeySource
            ? undefined
            : (currentCert?.hsmPublicKeySpki ?? recoveredKeyConfig?.hsmPublicKeySpki ?? undefined),
          actor: $toHsmActor(ctx.actor)
        }
      : undefined;

    try {
      await signerIssuanceService.requestIssuance({
        signerId: signer.id,
        projectId: signer.projectId,
        caId: ctx.params.caId,
        commonName: ctx.commonName,
        certificateTtlDays: ctx.certificateTtlDays,
        keyAlgorithm: target.keyAlgorithm,
        hsm: reissueHsm,
        digicertLifecycle: ctx.digicertReissueOrderId
          ? {
              mode: ctx.isRenewal ? DigiCertLifecycleMode.Renew : DigiCertLifecycleMode.Reissue,
              previousOrderId: ctx.digicertReissueOrderId
            }
          : undefined,
        keepOrderId: ctx.isRenewal ? undefined : ctx.digicertReissueOrderId
      });
      return await signerDAL.findById(signer.id);
    } catch (queueErr) {
      await $recordReissueFailure(
        ctx,
        queueErr,
        "Could not schedule re-issuance from the external Certificate Authority"
      );
      throw queueErr;
    }
  };

  const $attachInternalCertificate = async (signer: Pick<TPkiSigners, "id" | "name">, certificateId: string) => {
    const attached = await signerDAL.transaction(async (tx) => {
      const lockedSigner = await signerDAL.findByIdForUpdate(signer.id, tx);
      return signerDAL.updateUnlessRevoked(
        signer.id,
        buildAttachedCertificatePatch(lockedSigner?.status, certificateId),
        tx
      );
    });
    if (attached) return attached;

    await signerIssuanceService.revokeUnattachedCertificate(certificateId);
    throw new BadRequestError({ message: revokedCertificateMessage(signer.name) });
  };

  const $reissueInternalSigner = async (ctx: TReissueExecutionContext) => {
    const { params, signer, target, currentCert, commonName, certificateTtlDays } = ctx;
    try {
      let certificateId: string;
      if (target.isHsm) {
        if (target.switchingKeySource || !currentCert?.hsmKeyLabel) {
          const result = await issueHsmBackedSignerCertificate(hsmCertIssuanceDeps, {
            caId: params.caId,
            projectId: signer.projectId,
            commonName,
            certificateTtlDays,
            hsmConnectorId: target.hsmConnectorId,
            hsmKeyAlgorithm: target.hsmKeyAlgorithm
          });
          certificateId = result.certificateId;
        } else {
          const result = await renewHsmBackedSignerCertificate(hsmCertIssuanceDeps, {
            caId: params.caId,
            projectId: signer.projectId,
            commonName,
            certificateTtlDays,
            hsmConnectorId: target.hsmConnectorId,
            hsmKeyLabel: currentCert.hsmKeyLabel,
            hsmKeyId: currentCert.hsmKeyId,
            expectedPublicKeySpkiDer: currentCert.hsmPublicKeySpki ?? undefined,
            hsmKeyAlgorithm: target.hsmKeyAlgorithm
          });
          certificateId = result.certificateId;
        }
      } else {
        const result = await issueSignerCertificate(softwareCertIssuanceDeps, {
          caId: params.caId,
          projectId: signer.projectId,
          commonName,
          certificateTtlDays,
          keyAlgorithm: target.keyAlgorithm
        });
        certificateId = result.certificateId;
      }

      return await $attachInternalCertificate(signer, certificateId);
    } catch (issueErr) {
      logger.error(
        issueErr,
        `signer reissue: certificate issuance failed for signer '${signer.name}' [signerId=${signer.id}]`
      );
      await $recordReissueFailure(ctx, issueErr, "Internal CA certificate issuance failed");
      throw issueErr;
    }
  };

  const importCertificate = async (dto: TImportCertificateDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.ReissueCertificate, async (signer) => {
      assertSignerNotRevoked(signer);

      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(dto.caId);
      if (!ca || ca.projectId !== signer.projectId) {
        throw new NotFoundError({ message: `Certificate authority '${dto.caId}' not found in this organization.` });
      }
      if (ca.status !== CaStatus.ACTIVE) {
        throw new BadRequestError({ message: "The selected certificate authority is not active." });
      }
      const caType: CaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
      const importOrderId = $parseDigiCertOrderId(dto.externalOrderId, caType, "externalOrderId") as number;

      const imported = await $importExistingDigiCertCertificate({
        caId: ca.id,
        projectId: signer.projectId,
        orderId: importOrderId,
        certificate: { keySource: CertKeySource.Hsm, ...dto.certificate },
        actor: { type: dto.actor, id: dto.actorId, authMethod: dto.actorAuthMethod, orgId: dto.actorOrgId }
      });
      const renewBeforeDays =
        dto.certificateRenewBeforeDays !== undefined
          ? dto.certificateRenewBeforeDays
          : signer.certificateRenewBeforeDays;
      if (renewBeforeDays != null && renewBeforeDays >= imported.certificateTtlDays) {
        throw new BadRequestError({
          message: `Renew before (${renewBeforeDays}d) must be less than the validity of the certificate in DigiCert order ${importOrderId} (${imported.certificateTtlDays}d).`
        });
      }

      const updatedSigner = await signerDAL
        .transaction(async (tx) => {
          const closedRequests = await signerIssuanceService.cancelOpenRequests(
            signer.id,
            SignerIssuanceJobCancelReason.Superseded,
            {},
            tx
          );
          if (closedRequests.some((job) => getSignerJobDigiCertOrderId(job) === importOrderId)) {
            throw new ConflictError({
              message: `A certificate request into DigiCert order ${importOrderId} is already in progress for this signer, and it would revoke the order's current certificate. Wait for it to finish, then try again.`
            });
          }
          const importedCertificateId = await $attachImportedCertificate(imported, signer.id, tx);
          return $updateUnlessRevoked(
            signer,
            {
              caId: ca.id,
              commonName: imported.commonName,
              certificateTtlDays: imported.certificateTtlDays,
              ...(dto.certificateRenewBeforeDays !== undefined
                ? { certificateRenewBeforeDays: dto.certificateRenewBeforeDays }
                : {}),
              keyAlgorithm: imported.keyAlgorithm,
              externalCaConfig: null,
              nextAutoRenewalAt: null,
              certificateId: importedCertificateId,
              status: SignerStatus.Active,
              certificateFailureReason: null
            },
            tx
          );
        })
        .catch(async (error: unknown) => {
          await $rethrowConcurrentImport(error, imported);
          throw error;
        });
      return { signer: updatedSigner, caName: ca.name, hsmConnectorName: imported.hsmConnectorName };
    });
  const $resolveReissueExternalCaConfig = async ({
    signer,
    caId,
    reissueCaType,
    externalConfiguration
  }: {
    signer: TPkiSigners;
    caId: string;
    reissueCaType: CaType;
    externalConfiguration: TReissueCertificateDTO["externalConfiguration"];
  }) => {
    const explicitReissueOrderId = $parseDigiCertOrderId(
      externalConfiguration?.reissueFromExternalOrderId,
      reissueCaType,
      "reissueFromExternalOrderId"
    );
    if (explicitReissueOrderId) {
      await digicertFns.assertCodeSigningOrderReusable(caId, explicitReissueOrderId);
    }

    const providedAdcsTemplate = externalConfiguration?.template?.trim() || undefined;
    if (providedAdcsTemplate && reissueCaType !== CaType.ADCS) {
      throw new BadRequestError({
        message:
          "A certificate template can only be set for signers backed by an Active Directory Certificate Service CA."
      });
    }
    if (reissueCaType !== CaType.ADCS) return { explicitReissueOrderId, nextExternalCaConfig: null };

    const existingConfig = SignerExternalCaConfigSchema.safeParse(signer.externalCaConfig);
    const existingAdcsTemplate =
      existingConfig.success && existingConfig.data.caType === CaType.ADCS ? existingConfig.data.template : undefined;
    // Keep the signer's existing template when the request doesn't supply a new one.
    const template = providedAdcsTemplate ?? existingAdcsTemplate;
    if (!template) {
      throw new BadRequestError({
        message: "A certificate template is required for signers backed by an Active Directory Certificate Service CA."
      });
    }
    const nextExternalCaConfig: TSignerExternalCaConfig = { caType: CaType.ADCS, template };
    return { explicitReissueOrderId, nextExternalCaConfig };
  };

  const $prepareReissue = async (
    signer: TSignerWithCertificate,
    params: TReissueParams,
    { isRenewal, actor, nextAutoRenewalAt }: { isRenewal: boolean; actor?: TSignerActor; nextAutoRenewalAt?: Date }
  ) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(params.caId);
    if (!ca || ca.projectId !== signer.projectId) {
      throw new NotFoundError({ message: `Certificate authority '${params.caId}' not found in this organization.` });
    }
    if (ca.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "The selected certificate authority is not active." });
    }

    const reissueCaType: CaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
    assertCaTypeSupportsCodeSigning(reissueCaType);
    assertExternalConfigurationMatchesCaType(params.externalConfiguration, reissueCaType);
    const reissueIsExternal = reissueCaType !== CaType.INTERNAL;

    const { explicitReissueOrderId, nextExternalCaConfig } = await $resolveReissueExternalCaConfig({
      signer,
      caId: ca.id,
      reissueCaType,
      externalConfiguration: params.externalConfiguration
    });

    let nextCommonName = signer.commonName;
    let effectiveTtl = signer.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS;
    if (!explicitReissueOrderId) {
      if (params.commonName !== undefined) nextCommonName = params.commonName;
      if (params.certificateTtlDays !== undefined) effectiveTtl = params.certificateTtlDays;
    }

    if (!nextCommonName) {
      throw new BadRequestError({
        message: "Signer has no common name configured; cannot issue a certificate."
      });
    }

    if (signer.certificateRenewBeforeDays != null && signer.certificateRenewBeforeDays >= effectiveTtl) {
      throw new BadRequestError({
        message: `Certificate validity (${effectiveTtl}d) must be greater than the configured renew before (${signer.certificateRenewBeforeDays}d). Update the renew-before window before reissuing with a shorter validity.`
      });
    }

    const reissueCurrentCert = signer.certificateId
      ? await signerDAL.transaction((tx) => certificateDAL.findById(signer.certificateId as string, tx))
      : null;
    const isCurrentCertificateRevoked = reissueCurrentCert?.status === CertStatus.REVOKED;

    // A never-issued signer has no cert to read the key config from; recover it from the last job so
    // an HSM signer keeps its key source instead of falling back to software and being rejected.
    const recoveredKeyConfig = reissueCurrentCert
      ? null
      : await signerIssuanceService.getLatestIssuanceRequest(signer.id);

    const target = resolveReissueTarget({
      dto: params,
      signer,
      requireNewKey: isCurrentCertificateRevoked,
      currentCert:
        reissueCurrentCert ??
        (recoveredKeyConfig
          ? {
              keySource: recoveredKeyConfig.keySource,
              keyAlgorithm: recoveredKeyConfig.keyAlgorithm,
              hsmConnectorId: recoveredKeyConfig.hsmConnectorId
            }
          : null)
    });

    if ((reissueCaType === CaType.AZURE_AD_CS || reissueCaType === CaType.ADCS) && target.isHsm) {
      throw new BadRequestError({
        message:
          "HSM-backed signers are not supported with AD CS yet. Use AWS Private CA, an Internal CA, or switch the signer's key source to Infisical."
      });
    }

    if (reissueCaType === CaType.DIGICERT) {
      assertDigiCertCodeSigningKey({ isHsm: target.isHsm, keyAlgorithm: target.keyAlgorithm });
    }

    const hsmActor = $toHsmActor(actor);
    if (target.isHsm && hsmActor) {
      await hsmConnectorService.assertAttachPermission(hsmActor, target.hsmConnectorId, signer.projectId);
    }

    const currentDigicertOrderId = isCurrentCertificateRevoked
      ? undefined
      : DigiCertExternalMetadataSchema.safeParse(reissueCurrentCert?.externalMetadata).data?.orderId;
    const digicertReissueOrderId =
      reissueCaType === CaType.DIGICERT ? (explicitReissueOrderId ?? currentDigicertOrderId) : undefined;

    const tracksRequestStatus = !isRenewal && signer.status !== SignerStatus.Disabled;
    const ctx: TReissueExecutionContext = {
      params,
      actor,
      signer,
      target,
      currentCert: reissueCurrentCert,
      recoveredKeyConfig,
      commonName: nextCommonName,
      certificateTtlDays: effectiveTtl,
      digicertReissueOrderId,
      isRenewal,
      tracksRequestStatus
    };
    return {
      ctx,
      settings: {
        caId: params.caId,
        commonName: nextCommonName,
        certificateTtlDays: effectiveTtl,
        keyAlgorithm: target.keyAlgorithm,
        externalCaConfig: nextExternalCaConfig,
        nextAutoRenewalAt: nextAutoRenewalAt ?? null,
        certificateFailureReason: null,
        ...(tracksRequestStatus ? { status: SignerStatus.Pending } : {})
      },
      reissueIsExternal,
      caName: ca.name,
      previousSerialNumber: reissueCurrentCert?.serialNumber ?? null
    };
  };

  const $executeReissue = async ({
    ctx,
    settings,
    reissueIsExternal,
    caName,
    previousSerialNumber
  }: Awaited<ReturnType<typeof $prepareReissue>>) => {
    await signerDAL.transaction(async (tx) => {
      if (!ctx.isRenewal) {
        await signerIssuanceService.cancelOpenRequests(
          ctx.signer.id,
          SignerIssuanceJobCancelReason.Superseded,
          { keepOrderId: ctx.digicertReissueOrderId, leaveKeptJobPending: reissueIsExternal },
          tx
        );
      }
      await signerDAL.updateById(ctx.signer.id, settings, tx);
    });

    const reissuedSigner = reissueIsExternal ? await $reissueExternalSigner(ctx) : await $reissueInternalSigner(ctx);
    return { signer: reissuedSigner, caName, previousSerialNumber };
  };

  const $reissueCertificate = async (...args: Parameters<typeof $prepareReissue>) =>
    $executeReissue(await $prepareReissue(...args));

  const reissueCertificate = async (dto: TReissueCertificateDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.ReissueCertificate, async (signer) => {
      assertSignerNotRevoked(signer, { allowRevoked: true });
      return (await $reissueCertificate(signer, dto, { isRenewal: false, actor: dto })).signer;
    });

  const $assertRenewable = (signer: TSignerWithCertificate) => {
    if (signer.hasOpenCertificateRequest || signer.status === SignerStatus.Pending) {
      throw new BadRequestError({ message: certificateRequestInProgressMessage(signer.name) });
    }
    if (!signer.certificateId) {
      throw new BadRequestError({
        message: `Signer '${signer.name}' doesn't have a certificate yet. Use Retry Issuance to request one.`
      });
    }
    assertSignerNotRevoked(signer);
    if (signer.status === SignerStatus.Disabled) {
      throw new BadRequestError({
        message: `Signer '${signer.name}' is disabled. Enable it, then renew its certificate.`
      });
    }
    if (!signer.caId) {
      throw new BadRequestError({
        message: `Signer '${signer.name}' has no certificate authority to renew from. Choose one in Edit Settings, which issues a new certificate.`
      });
    }
    return signer.caId;
  };

  const renewCertificate = async (dto: TRenewCertificateDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.ReissueCertificate, async (signer) => {
      const caId = $assertRenewable(signer);
      const renewed = await $reissueCertificate(signer, { caId }, { isRenewal: true, actor: dto });
      return { ...renewed, caId };
    });

  const $notifyRevokeRefused = async (signer: Pick<TPkiSigners, "id" | "name" | "projectId">, reason: string) => {
    try {
      const memberships = await membershipDAL.find({
        scope: RESOURCE_SCOPE,
        scopeResourceType: ResourceType.Signer,
        scopeResourceId: signer.id,
        isActive: true
      });
      const adminMembershipIds = memberships.length
        ? new Set(
            (
              await membershipRoleDAL.find({
                $in: { membershipId: memberships.map((membership) => membership.id) },
                role: ResourceMembershipRole.Admin
              })
            )
              .filter(isActiveRole)
              .map((role) => role.membershipId)
          )
        : new Set<string>();
      const adminMemberships = memberships.filter((membership) => adminMembershipIds.has(membership.id));
      const adminGroupIds = adminMemberships
        .map((membership) => membership.actorGroupId)
        .filter((id): id is string => Boolean(id));
      const groupUsers = adminGroupIds.length
        ? await userGroupMembershipDAL.find({ $in: { groupId: adminGroupIds } })
        : [];
      const project = await projectDAL.findOne({ id: signer.projectId });
      const adminUserIds = await findUsersWithOrgAccess(
        { orgDAL, userDAL },
        {
          orgId: project.orgId,
          userIds: [
            ...new Set([
              ...adminMemberships.map((membership) => membership.actorUserId).filter((id): id is string => Boolean(id)),
              ...groupUsers.map((groupUser) => groupUser.userId)
            ])
          ]
        }
      );
      if (!adminUserIds.size) return;

      await notificationService.createUserNotifications(
        [...adminUserIds].map((userId) => ({
          userId,
          orgId: project.orgId,
          type: NotificationType.SIGNER_REVOKE_REFUSED,
          title: "Signer Revoke Refused",
          body: `The certificate of signer **${signer.name}** wasn't revoked, so it's still valid. Reason: ${reason.endsWith(".") ? reason : `${reason}.`} Any renewal or reissue that was in progress was canceled. Start it again if you still need it.`,
          link: `/organizations/${project.orgId}/cert-manager/code-signing/${signer.id}`
        }))
      );
    } catch (err) {
      logger.error(
        err,
        `signer revoke: notifying the signer's admins of a refused revoke failed [signerId=${signer.id}]`
      );
    }
  };

  const $settleRevocation = async (
    revocation: Pick<TPkiSignerCertificateRevocations, "id" | "signerId">,
    outcome:
      | { status: SignerRevocationStatus.Completed }
      | { status: SignerRevocationStatus.Rejected | SignerRevocationStatus.Failed; failureReason: string }
  ) => {
    const settled = await signerDAL.transaction(async (tx) => {
      const lockedSigner = await signerDAL.findByIdForUpdate(revocation.signerId, tx);
      const settledRevocation = await signerRevocationDAL.updateIfUnsettled(
        revocation.id,
        {
          status: outcome.status,
          failureReason:
            outcome.status === SignerRevocationStatus.Completed ? null : outcome.failureReason.slice(0, 1000)
        },
        tx
      );
      if (!lockedSigner || !settledRevocation) return null;
      if (outcome.status === SignerRevocationStatus.Failed) return lockedSigner;
      let settledStatus = SignerStatus.Revoked;
      if (outcome.status === SignerRevocationStatus.Rejected) {
        settledStatus =
          settledRevocation.previousSignerStatus === SignerStatus.Disabled
            ? SignerStatus.Disabled
            : SignerStatus.Active;
      }
      return signerDAL.updateById(lockedSigner.id, { status: settledStatus, certificateFailureReason: null }, tx);
    });
    if (settled && outcome.status === SignerRevocationStatus.Rejected) {
      await $notifyRevokeRefused(settled, outcome.failureReason);
    }
    return settled;
  };

  const $auditRevocationDecision = async (
    revocation: TPkiSignerCertificateRevocations,
    certificate: Pick<TCertificates, "projectId" | "serialNumber" | "commonName">,
    settledSigner: TPkiSigners | null,
    decision: DigiCertRevocationRequestStatus.Approved | DigiCertRevocationRequestStatus.Rejected
  ) => {
    if (!settledSigner) return;
    try {
      const project = await projectDAL.findOne({ id: certificate.projectId });
      await auditLogService.createAuditLog({
        actor: { type: ActorType.PLATFORM, metadata: {} },
        orgId: project.orgId,
        projectId: certificate.projectId,
        event: {
          type: EventType.PKI_SIGNER_CERTIFICATE_REVOCATION_DECIDED,
          metadata: {
            signerId: settledSigner.id,
            name: settledSigner.name,
            certificateId: revocation.certificateId,
            certificateCommonName: certificate.commonName,
            serialNumber: certificate.serialNumber,
            revocationReason: revocation.revocationReason as CrlReason,
            digicertRevocationRequestId: revocation.caRequestId ?? undefined,
            decision,
            status: settledSigner.status
          }
        }
      });
    } catch (err) {
      logger.error(
        err,
        `signer revoke: writing the revocation decision audit log failed [signerId=${settledSigner.id}]`
      );
    }
  };

  const $stopTrackingRevocation = async (revocation: TPkiSignerCertificateRevocations, cause: string) => {
    await $settleRevocation(revocation, {
      status: SignerRevocationStatus.Failed,
      failureReason: `Infisical stopped checking DigiCert revocation request #${revocation.caRequestId} because ${cause}. The signer still can't sign. Check the request in CertCentral, then revoke the certificate again.`
    });
    logger.warn(
      `signer revoke: stopped tracking a pending DigiCert revocation (${cause}) [signerId=${revocation.signerId}] [requestId=${revocation.caRequestId}]`
    );
  };

  const $applyRevocationDecision = async (
    revocation: TPkiSignerCertificateRevocations,
    certificate: Pick<TCertificates, "id" | "projectId" | "status" | "serialNumber" | "commonName">,
    requestId: number,
    decision: DigiCertRevocationRequestStatus.Approved | DigiCertRevocationRequestStatus.Rejected
  ) => {
    if (decision === DigiCertRevocationRequestStatus.Approved && certificate.status !== CertStatus.REVOKED) {
      const project = await projectDAL.findOne({ id: certificate.projectId });
      await certificateService.completeOwnedCertificateRevocation({
        certificateId: certificate.id,
        revocationReason: revocation.revocationReason as CrlReason,
        orgId: project.orgId
      });
    }
    const settledSigner = await $settleRevocation(
      revocation,
      decision === DigiCertRevocationRequestStatus.Approved
        ? { status: SignerRevocationStatus.Completed }
        : { status: SignerRevocationStatus.Rejected, failureReason: digiCertRejectedRevocationMessage(requestId) }
    );
    await $auditRevocationDecision(revocation, certificate, settledSigner, decision);
  };

  const $syncPendingRevocation = async (revocation: TPkiSignerCertificateRevocations, requestId: number) => {
    const cert = await certificateDAL.findById(revocation.certificateId);
    const ca = cert?.caId ? await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId) : null;
    if (!cert || !ca) {
      await $stopTrackingRevocation(revocation, "its certificate authority was removed");
      return;
    }
    if (ca.status !== CaStatus.ACTIVE) {
      await $stopTrackingRevocation(revocation, `certificate authority '${ca.name}' is disabled`);
      return;
    }
    let requestStatus: DigiCertRevocationRequestStatus;
    try {
      requestStatus = await digicertFns.getRevocationRequestStatus({ caId: ca.id, requestId });
    } catch (err) {
      if (!(err instanceof BadRequestError)) throw err;
      await $stopTrackingRevocation(revocation, `DigiCert refused the status check (${err.message})`);
      return;
    }
    if (
      requestStatus === DigiCertRevocationRequestStatus.Approved ||
      requestStatus === DigiCertRevocationRequestStatus.Rejected
    ) {
      await $applyRevocationDecision(revocation, cert, requestId, requestStatus);
      logger.info(
        `signer revoke: DigiCert decided the revocation [decision=${requestStatus}] [signerId=${revocation.signerId}] [requestId=${requestId}]`
      );
      return;
    }
    if (
      requestStatus !== DigiCertRevocationRequestStatus.Pending &&
      requestStatus !== DigiCertRevocationRequestStatus.Submitted
    ) {
      await $stopTrackingRevocation(revocation, `DigiCert reports it as '${String(requestStatus)}'`);
    }
  };

  const syncPendingRevocations = async () => {
    const revocations = await signerRevocationDAL.find({ status: SignerRevocationStatus.AwaitingApproval });
    for (const revocation of revocations) {
      const { caRequestId } = revocation;
      if (caRequestId) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await withSignerCertificateLock(
            keyStore,
            revocation.signerId,
            () => undefined,
            () => $syncPendingRevocation(revocation, caRequestId)
          );
        } catch (err) {
          logger.error(
            err,
            `signer revoke: checking the pending DigiCert revocation failed [signerId=${revocation.signerId}]`
          );
        }
      }
    }
  };

  const $resumeDigiCertRevocation = async (
    revocation: TPkiSignerCertificateRevocations,
    requestId: number,
    certificate: Pick<TCertificates, "id" | "caId" | "projectId" | "status" | "serialNumber" | "commonName">
  ) => {
    let requestStatus: DigiCertRevocationRequestStatus | undefined;
    try {
      requestStatus = certificate.caId
        ? await digicertFns.getRevocationRequestStatus({ caId: certificate.caId, requestId })
        : undefined;
    } catch (err) {
      if (!(err instanceof BadRequestError || err instanceof NotFoundError)) {
        await $settleRevocation(revocation, {
          status: SignerRevocationStatus.Failed,
          failureReason: UNFINISHED_REVOKE_REASON
        });
        throw err;
      }
    }
    if (!requestStatus) {
      await signerRevocationDAL.updateIfUnsettled(revocation.id, { caRequestId: null });
      return undefined;
    }
    if (
      requestStatus === DigiCertRevocationRequestStatus.Pending ||
      requestStatus === DigiCertRevocationRequestStatus.Submitted
    ) {
      await signerRevocationDAL.updateIfUnsettled(revocation.id, { status: SignerRevocationStatus.AwaitingApproval });
      return requestStatus;
    }
    if (requestStatus === DigiCertRevocationRequestStatus.Approved) {
      await $applyRevocationDecision(revocation, certificate, requestId, requestStatus);
      return requestStatus;
    }
    if (requestStatus === DigiCertRevocationRequestStatus.Rejected) {
      await $applyRevocationDecision(revocation, certificate, requestId, requestStatus);
      throw new BadRequestError({ message: digiCertRejectedRevocationMessage(requestId) });
    }
    return undefined;
  };

  const $assertCertificateRevocable = async (
    signer: Pick<TPkiSigners, "id" | "name">,
    certificate: { id?: string | null; status?: string | null; caId?: string | null } | null | undefined,
    tx?: Knex
  ) => {
    if (!certificate?.id) {
      throw new BadRequestError({ message: `Signer '${signer.name}' doesn't have a certificate to revoke.` });
    }
    if (certificate.status === CertStatus.REVOKED) {
      throw new BadRequestError({ message: revokedCertificateMessage(signer.name) });
    }
    if (!certificate.caId) {
      throw new BadRequestError({
        message: `Signer '${signer.name}' uses an imported certificate, so it can't be revoked here. Revoke it with the certificate authority that issued it.`
      });
    }
    const [signerSharingCertificate] = await signerDAL.find(
      { certificateId: certificate.id, $notEqual: { id: signer.id } },
      { tx, limit: 1 }
    );
    if (signerSharingCertificate) {
      throw new BadRequestError({
        message: `Signer '${signer.name}' shares its certificate with signer '${signerSharingCertificate.name}', so revoking it would stop both. Delete signer '${signerSharingCertificate.name}' first, then revoke.`
      });
    }
  };

  const $buildRevokeResponse = async (
    signer: TSignerWithCertificate,
    certificate: Pick<TCertificates, "id" | "serialNumber" | "commonName">,
    { caRequestId, crlWarning }: { caRequestId?: number; crlWarning?: string } = {}
  ) => {
    const revocationState: {
      status: TUnsettledSignerRevocationStatus;
      caRequestId: number;
      failureReason: null;
    } | null = caRequestId
      ? { status: SignerRevocationStatus.AwaitingApproval, caRequestId, failureReason: null }
      : null;
    return {
      signer: { ...((await $readFreshSigner(signer.id)) ?? signer), revocation: revocationState },
      certificateId: certificate.id,
      serialNumber: certificate.serialNumber,
      commonName: certificate.commonName,
      pendingRevocationRequestId: caRequestId,
      crlWarning
    };
  };

  const $openRevocation = async (signer: TSignerWithCertificate, dto: TRevokeSignerCertificateDTO) => {
    if (signer.status === SignerStatus.Revoked) {
      throw new BadRequestError({ message: revokedCertificateMessage(signer.name) });
    }
    const isRetry = signer.status === SignerStatus.RevocationPending;
    if (!isRetry) {
      await $assertCertificateRevocable(signer, {
        id: signer.certificateId,
        status: signer.certificateStatus,
        caId: signer.certificateCaId
      });
      if (!signer.caType || !caSupportsCapability(signer.caType, CaCapability.REVOKE_CERTIFICATES)) {
        throw new BadRequestError({
          message: `Signer '${signer.name}' uses a certificate authority that can't revoke certificates from Infisical. Revoke the certificate with the certificate authority that issued it.`
        });
      }
    }
    const keepOrderId = isRetry ? undefined : await signerIssuanceService.cancelPendingDigiCertReissue(signer.id);

    return signerDAL.transaction(async (tx) => {
      const lockedSigner = await signerDAL.findByIdForUpdate(signer.id, tx);
      const lockedCertificate = lockedSigner?.certificateId
        ? await certificateDAL.findById(lockedSigner.certificateId, tx)
        : undefined;
      const unsettledRevocation = await signerRevocationDAL.findUnsettledForSigner(signer.id, tx);
      if (unsettledRevocation?.status === SignerRevocationStatus.AwaitingApproval && unsettledRevocation.caRequestId) {
        throw new BadRequestError({
          message: pendingRevocationMessage(signer.name, unsettledRevocation.caRequestId)
        });
      }
      if (!lockedSigner?.certificateId || !lockedCertificate) {
        throw new BadRequestError({ message: `Signer '${signer.name}' doesn't have a certificate to revoke.` });
      }
      if (!unsettledRevocation) await $assertCertificateRevocable(signer, lockedCertificate, tx);
      const openedRevocation = unsettledRevocation
        ? await signerRevocationDAL.updateIfUnsettled(
            unsettledRevocation.id,
            {
              status: SignerRevocationStatus.Submitting,
              revocationReason: dto.revocationReason,
              failureReason: null
            },
            tx
          )
        : await signerRevocationDAL.create(
            {
              signerId: signer.id,
              certificateId: lockedSigner.certificateId,
              status: SignerRevocationStatus.Submitting,
              revocationReason: dto.revocationReason,
              previousSignerStatus: lockedSigner.status
            },
            tx
          );
      await signerDAL.updateById(signer.id, { status: SignerStatus.RevocationPending }, tx);
      await signerIssuanceService.cancelOpenRequests(
        signer.id,
        SignerIssuanceJobCancelReason.Revoked,
        { keepOrderId },
        tx
      );
      return {
        revocation: openedRevocation as TPkiSignerCertificateRevocations,
        certificate: lockedCertificate,
        isRetryOfUnknownOutcome: Boolean(unsettledRevocation)
      };
    });
  };

  const $submitRevocation = async (
    signer: TSignerWithCertificate,
    { revocation, certificate, isRetryOfUnknownOutcome }: Awaited<ReturnType<typeof $openRevocation>>,
    dto: TRevokeSignerCertificateDTO
  ) => {
    if (certificate.status === CertStatus.REVOKED) {
      await $settleRevocation(revocation, { status: SignerRevocationStatus.Completed });
      return $buildRevokeResponse(signer, certificate);
    }

    if (revocation.caRequestId) {
      const resumed = await $resumeDigiCertRevocation(revocation, revocation.caRequestId, certificate);
      if (resumed === DigiCertRevocationRequestStatus.Approved) return $buildRevokeResponse(signer, certificate);
      if (resumed) return $buildRevokeResponse(signer, certificate, { caRequestId: revocation.caRequestId });
    }

    let revokeResult: Awaited<ReturnType<typeof signerIssuanceService.revokeAtCa>>;
    try {
      revokeResult = await signerIssuanceService.revokeAtCa(certificate, dto.revocationReason, dto.actorOrgId);
    } catch (err) {
      const recheckedCertificate = await signerDAL.transaction((tx) => certificateDAL.findById(certificate.id, tx));
      if (recheckedCertificate?.status === CertStatus.REVOKED) {
        logger.error(
          err,
          `signer revoke: the revoke reported an error after the certificate was revoked, finishing it [signerId=${signer.id}] [certificateId=${certificate.id}]`
        );
        await $settleRevocation(revocation, { status: SignerRevocationStatus.Completed });
        return $buildRevokeResponse(signer, certificate);
      }
      const isRefusal = err instanceof BadRequestError || err instanceof NotFoundError;
      const refusalMessage = (err as Error).message;
      if (isRefusal && isRetryOfUnknownOutcome) {
        await $settleRevocation(revocation, {
          status: SignerRevocationStatus.Failed,
          failureReason: `The certificate authority refused this revoke (${refusalMessage.endsWith(".") ? refusalMessage.slice(0, -1) : refusalMessage}), but the earlier revoke request may still be pending. Check the request with the certificate authority, in CertCentral for DigiCert, then revoke the certificate again.`
        });
      } else if (isRefusal) {
        await $settleRevocation(revocation, { status: SignerRevocationStatus.Rejected, failureReason: refusalMessage });
      } else {
        await $settleRevocation(revocation, {
          status: SignerRevocationStatus.Failed,
          failureReason: UNFINISHED_REVOKE_REASON
        });
      }
      throw err;
    }

    if (revokeResult.caRequestId) {
      await signerRevocationDAL.updateIfUnsettled(revocation.id, {
        status: SignerRevocationStatus.AwaitingApproval,
        caRequestId: revokeResult.caRequestId
      });
      return $buildRevokeResponse(signer, certificate, { caRequestId: revokeResult.caRequestId });
    }

    await $settleRevocation(revocation, { status: SignerRevocationStatus.Completed });
    return $buildRevokeResponse(signer, certificate, { crlWarning: revokeResult.crlWarning });
  };

  const revokeCertificate = async (dto: TRevokeSignerCertificateDTO) =>
    $withLockedSigner(dto, ResourcePermissionSignerActions.RevokeCertificate, async (signer) =>
      $submitRevocation(signer, await $openRevocation(signer, dto), dto)
    );

  const exportCertificate = async (dto: TExportCertificateDTO) => {
    const signer = await signerDAL.findByIdWithCertificate(dto.signerId);
    if (!signer) throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ExportCertificate,
      ResourcePermissionSub.Signer
    );

    if (!signer.certificateId) {
      throw new BadRequestError({ message: `Signer '${signer.name}' has no certificate attached yet.` });
    }

    const certBody = await certificateBodyDAL.findOne({ certId: signer.certificateId });
    if (!certBody?.encryptedCertificate) {
      throw new BadRequestError({
        message: `Certificate body not found for signer '${signer.name}'.`
      });
    }

    const keyId = await getProjectKmsCertificateKeyId({
      projectId: signer.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: keyId });
    const decryptedCert = await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate });
    const cert = new x509.X509Certificate(decryptedCert);
    const certificatePem = cert.toString("pem");
    const serialNumber = (cert.serialNumber || "").replace(/^0x/i, "").toLowerCase();

    return {
      certificatePem,
      serialNumber,
      signerName: signer.name,
      projectId: signer.projectId
    };
  };

  type TSigningAccessResolution = {
    grantId: string | null;
    matchedGrantAttributes: TCodeSigningGrantAttributes | null;
    pendingOperationId: string | null;
    deniedReason?: string;
  };

  const $resolveSigningAccess = async ({
    signer,
    projectId,
    dto,
    dataHash,
    observedContext,
    operationClientMetadata
  }: {
    signer: { id: string; name: string };
    projectId: string;
    dto: TSignDataDTO;
    dataHash: string;
    observedContext: TObservedSigningContext;
    operationClientMetadata: Record<string, unknown> | null;
  }): Promise<TSigningAccessResolution> =>
    projectDAL.transaction(async (tx) => {
      const [userGrants, identityGrants] = await Promise.all([
        approvalRequestGrantsDAL.find(
          {
            granteeUserId: dto.actorId,
            type: ApprovalPolicyType.CertCodeSigning,
            status: ApprovalRequestGrantStatus.Active,
            projectId,
            revokedAt: null
          },
          { tx }
        ),
        approvalRequestGrantsDAL.find(
          {
            granteeMachineIdentityId: dto.actorId,
            type: ApprovalPolicyType.CertCodeSigning,
            status: ApprovalRequestGrantStatus.Active,
            projectId,
            revokedAt: null
          },
          { tx }
        )
      ]);

      const activeGrants = [...userGrants, ...identityGrants];

      let matchingGrant: (typeof activeGrants)[number] | undefined;

      const now = new Date();
      const expiredGrantIds: string[] = [];
      const mismatchedScopeFields = new Set<CodeSigningScopeField>();

      for (const grant of activeGrants) {
        const { verdict, mismatchedFields } = classifyGrantForSigning(grant, signer.id, observedContext, now);

        if (verdict === SigningGrantVerdict.Expired) {
          expiredGrantIds.push(grant.id);
        } else if (verdict === SigningGrantVerdict.ScopeMismatch) {
          mismatchedFields.forEach((field) => mismatchedScopeFields.add(field));
        } else if (verdict === SigningGrantVerdict.Usable) {
          matchingGrant ??= grant;
        }
      }

      await Promise.all(
        expiredGrantIds.map((id) =>
          approvalRequestGrantsDAL.updateById(id, { status: ApprovalRequestGrantStatus.Expired }, tx)
        )
      );

      let selectedGrantBecameUnusable = false;

      if (matchingGrant) {
        const lockedGrant = await approvalRequestGrantsDAL.findByIdForUpdate(matchingGrant.id, tx);
        if (!lockedGrant || lockedGrant.status !== ApprovalRequestGrantStatus.Active) {
          matchingGrant = undefined;
          selectedGrantBecameUnusable = true;
        } else {
          const lockedAttributes = lockedGrant.attributes as TCodeSigningGrantAttributes | null;
          if (lockedAttributes?.maxSignings) {
            const signingsUsed = await signingOperationDAL.countByGrantId(matchingGrant.id, tx);
            if (signingsUsed >= lockedAttributes.maxSignings) {
              await approvalRequestGrantsDAL.updateById(
                matchingGrant.id,
                { status: ApprovalRequestGrantStatus.Expired },
                tx
              );
              matchingGrant = undefined;
              selectedGrantBecameUnusable = true;
            }
          }
        }
      }

      if (!matchingGrant) {
        if (mismatchedScopeFields.size > 0 && !selectedGrantBecameUnusable) {
          const fieldLabels = Array.from(mismatchedScopeFields)
            .map((field) => CODE_SIGNING_SCOPE_FIELD_LABELS[field])
            .join(", ");
          return {
            grantId: null,
            matchedGrantAttributes: null,
            pendingOperationId: null,
            deniedReason:
              `Signing with signer '${signer.name}' was denied: your approved access is scoped to specific signing parameters, ` +
              `and this request does not match the approved ${fieldLabels}. ` +
              `Sign with the parameters you were approved for, or request new signing access for these parameters.`
          };
        }
        return {
          grantId: null,
          matchedGrantAttributes: null,
          pendingOperationId: null,
          deniedReason:
            `Signing with signer '${signer.name}' requires approved access, but none is currently active. ` +
            `Access may not have been requested or approved yet, may have expired, or may have reached its signature limit. ` +
            `Request signing access for this signer and try again once it's approved.`
        };
      }

      const pendingOperation = await signingOperationDAL.create(
        {
          signerId: dto.signerId,
          projectId,
          status: SigningOperationStatus.Pending,
          signingAlgorithm: dto.signingAlgorithm,
          dataHash,
          actorType: dto.actor,
          actorId: dto.actorId,
          actorName: dto.actorName ?? null,
          approvalGrantId: matchingGrant.id,
          clientMetadata: operationClientMetadata
        },
        tx
      );

      return {
        grantId: matchingGrant.id,
        matchedGrantAttributes: matchingGrant.attributes as TCodeSigningGrantAttributes | null,
        pendingOperationId: pendingOperation.id,
        deniedReason: undefined
      };
    });

  const $countPolicySteps = async (policyId: string): Promise<number> => {
    const steps = await approvalPolicyDAL.findStepsByPolicyId(policyId);
    return steps.length;
  };

  const sign = async (dto: TSignDataDTO) => {
    const signer = await signerDAL.findByIdWithCertificate(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { projectId } = signer;

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Sign, ResourcePermissionSub.Signer);

    assertSignerNotRevoked(signer);
    if (signer.status !== SignerStatus.Active) {
      throw new BadRequestError({ message: `Signer '${signer.name}' is not active (status: ${signer.status})` });
    }
    if (!signer.certificateId) {
      throw new BadRequestError({ message: `Signer '${signer.name}' has no certificate attached.` });
    }
    if (signer.certificateNotAfter && new Date() > new Date(signer.certificateNotAfter)) {
      throw new BadRequestError({ message: `Certificate for signer '${signer.name}' has expired` });
    }

    const dataBuffer = Buffer.from(dto.data, "base64");
    if (dataBuffer.length > MAX_DATA_BYTES) {
      throw new BadRequestError({
        message: `Data exceeds maximum size of ${MAX_DATA_BYTES} bytes`
      });
    }

    const dataHash = crypto.nativeCrypto.createHash("sha256").update(dataBuffer).digest("hex");

    const certificate = await certificateDAL.findById(signer.certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: `Signer certificate ${signer.certificateId} not found` });
    }
    const isHsmBacked = certificate.keySource === CertKeySource.Hsm;

    let certPrivateKey: Buffer | undefined;
    let keyAlgorithm: AsymmetricKeyAlgorithm;

    if (isHsmBacked) {
      if (!certificate.keyAlgorithm) {
        throw new BadRequestError({
          message: "HSM-backed certificate is missing keyAlgorithm; re-issue the certificate."
        });
      }
      keyAlgorithm = certificate.keyAlgorithm as AsymmetricKeyAlgorithm;
    } else {
      const creds = await getCertificateCredentials({
        certId: signer.certificateId,
        projectId,
        certificateSecretDAL,
        projectDAL,
        kmsService
      });
      certPrivateKey = Buffer.from(creds.certPrivateKey);
      const privateKeyObject = crypto.nativeCrypto.createPrivateKey({
        key: creds.certPrivateKey,
        format: "pem",
        type: "pkcs8"
      });
      keyAlgorithm = getKeyAlgorithmFamily(privateKeyObject);
    }

    validateSigningAlgorithmForKey(dto.signingAlgorithm, keyAlgorithm);

    const requiresApproval = signer.approvalPolicyId ? (await $countPolicySteps(signer.approvalPolicyId)) > 0 : false;

    const clientMetadata = dto.clientMetadata
      ? {
          ...dto.clientMetadata,
          tool: dto.clientMetadata.tool ?? dto.clientMetadata.signingApplication,
          signingApplication: undefined
        }
      : undefined;

    const observedContext = buildObservedSigningContext({
      clientMetadata,
      ipAddress: dto.ipAddress,
      dataHash
    });
    const operationClientMetadata =
      clientMetadata || dto.ipAddress
        ? {
            ...clientMetadata,
            ...(clientMetadata?.command ? { command: redactCommandCredentials(clientMetadata.command) } : {}),
            sourceIp: dto.ipAddress
          }
        : null;

    let grantId: string | null = null;
    let matchedGrantAttributes: TCodeSigningGrantAttributes | null = null;
    let pendingOperationId: string | null = null;

    if (requiresApproval) {
      const access = await $resolveSigningAccess({
        signer,
        projectId,
        dto,
        dataHash,
        observedContext,
        operationClientMetadata
      });

      if (access.deniedReason) {
        const pendingRequests = await approvalRequestDAL.find({
          scopeType: ApprovalPolicyScope.Signer,
          scopeId: signer.id,
          status: ApprovalRequestStatus.Pending,
          ...(dto.actor === ActorType.USER ? { requesterId: dto.actorId } : { machineIdentityId: dto.actorId })
        });
        const hasPendingRequest = pendingRequests.some((request) => {
          const pendingScope = (request.requestData as { requestData?: TCodeSigningRequestData } | null)?.requestData
            ?.scope;
          return getCodeSigningScopeMismatches(pendingScope, observedContext).length === 0;
        });

        throw new ForbiddenRequestError({
          message: access.deniedReason,
          name: SIGNER_APPROVAL_REQUIRED_ERROR_NAME,
          details: { hasPendingRequest }
        });
      }

      grantId = access.grantId;
      matchedGrantAttributes = access.matchedGrantAttributes;
      pendingOperationId = access.pendingOperationId;
    }

    let signatureBuffer: Buffer;
    try {
      if (isHsmBacked) {
        // ECDSA signatures arrive as raw r||s; convert to ASN.1 DER for X.509 / JCE consumers.
        const mech = mapSigningAlgorithmToPkcs11Mechanism(dto.signingAlgorithm, dto.isDigest);
        // Pre-hashed RSA (CKM_RSA_PKCS): rebuild the DigestInfo the HSM pads and signs. For every other
        // mechanism the payload is passed through unchanged (raw message or raw digest).
        const hsmData =
          mech.mechanism === Pkcs11Mechanism.RsaPkcs
            ? wrapRsaPkcs1DigestInfo(dto.signingAlgorithm, dataBuffer)
            : dataBuffer;
        const signature = await hsmConnectorService.sign({
          connectorId: certificate.hsmConnectorId as string,
          projectId,
          keyLabel: certificate.hsmKeyLabel as string,
          keyId: certificate.hsmKeyId,
          publicKeySpki: certificate.hsmPublicKeySpki ?? null,
          mechanism: mech.mechanism,
          data: hsmData,
          isDigest: dto.isDigest
        });
        signatureBuffer = mech.isEcdsa ? ecdsaRawRsToDer(signature) : signature;
      } else {
        const privateKeyPem = certPrivateKey as Buffer;
        const svc = signingService(keyAlgorithm);
        signatureBuffer = await svc.sign(dataBuffer, privateKeyPem, dto.signingAlgorithm, dto.isDigest);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown signing error";
      logger.error(error, `Code signing failed for signer '${signer.name}'`);
      try {
        if (pendingOperationId) {
          await signingOperationDAL.updateById(pendingOperationId, {
            status: SigningOperationStatus.Failed,
            errorMessage: errorMessage.substring(0, 255)
          });
        } else {
          await signingOperationDAL.create({
            signerId: dto.signerId,
            projectId,
            status: SigningOperationStatus.Failed,
            signingAlgorithm: dto.signingAlgorithm,
            dataHash,
            actorType: dto.actor,
            actorId: dto.actorId,
            actorName: dto.actorName ?? null,
            approvalGrantId: grantId,
            clientMetadata: operationClientMetadata,
            errorMessage: errorMessage.substring(0, 255)
          });
        }
      } catch (writeErr) {
        logger.warn(writeErr, "Failed to record signing-operation failure row");
      }
      throw error;
    }

    await projectDAL.transaction(async (tx) => {
      if (pendingOperationId) {
        await signingOperationDAL.updateById(pendingOperationId, { status: SigningOperationStatus.Success }, tx);
      } else {
        await signingOperationDAL.create(
          {
            signerId: dto.signerId,
            projectId,
            status: SigningOperationStatus.Success,
            signingAlgorithm: dto.signingAlgorithm,
            dataHash,
            actorType: dto.actor,
            actorId: dto.actorId,
            actorName: dto.actorName ?? null,
            approvalGrantId: grantId,
            clientMetadata: operationClientMetadata
          },
          tx
        );
      }

      if (grantId && matchedGrantAttributes?.maxSignings) {
        const newCount = await signingOperationDAL.countByGrantId(grantId, tx);
        if (newCount >= matchedGrantAttributes.maxSignings) {
          await approvalRequestGrantsDAL.updateById(grantId, { status: ApprovalRequestGrantStatus.Expired }, tx);
        }
      }

      await signerDAL.updateById(dto.signerId, { lastSignedAt: new Date() }, tx);
    });

    return {
      signature: signatureBuffer.toString("base64"),
      signingAlgorithm: dto.signingAlgorithm,
      signerId: dto.signerId,
      signerName: signer.name,
      projectId
    };
  };

  const getPublicKey = async (dto: TGetPublicKeyDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { projectId } = signer;

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Read, ResourcePermissionSub.Signer);

    if (!signer.certificateId) {
      throw new BadRequestError({ message: `Signer '${signer.name}' has no certificate attached yet.` });
    }

    const certificate = await certificateDAL.findById(signer.certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: `Signer certificate ${signer.certificateId} not found` });
    }

    let publicKeyObject: ReturnType<typeof crypto.nativeCrypto.createPublicKey>;
    if (certificate.keySource === CertKeySource.Hsm) {
      const certBody = await certificateBodyDAL.findOne({ certId: signer.certificateId });
      if (!certBody?.encryptedCertificate) {
        throw new BadRequestError({ message: `Certificate body not found for signer '${signer.name}'.` });
      }
      const keyId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
      const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: keyId });
      const decryptedCert = await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate });
      const cert = new x509.X509Certificate(decryptedCert);
      publicKeyObject = crypto.nativeCrypto.createPublicKey({
        key: Buffer.from(cert.publicKey.rawData),
        format: "der",
        type: "spki"
      });
    } else {
      const { certPublicKey } = await getCertificateCredentials({
        certId: signer.certificateId,
        projectId,
        certificateSecretDAL,
        projectDAL,
        kmsService
      });

      if (!certPublicKey) {
        throw new BadRequestError({
          message:
            "Public key derivation is not supported for this certificate's key type. PQC certificates cannot be used as code signers."
        });
      }

      publicKeyObject = crypto.nativeCrypto.createPublicKey({
        key: certPublicKey,
        format: "pem",
        type: "spki"
      });
    }

    const publicKeyDer = publicKeyObject.export({ format: "der", type: "spki" });

    const keyAlgorithm = getKeyAlgorithmFamily(publicKeyObject);

    return {
      publicKey: publicKeyDer.toString("base64"),
      algorithm: keyAlgorithm,
      signerName: signer.name,
      projectId
    };
  };

  const listOperations = async (dto: TListSigningOperationsDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Read, ResourcePermissionSub.Signer);

    const operations = await signingOperationDAL.findBySignerId(dto.signerId, {
      offset: dto.offset,
      limit: dto.limit,
      status: dto.status
    });

    const totalCount = await signingOperationDAL.countBySignerId(dto.signerId, dto.status);

    return { operations, totalCount, signerName: signer.name, projectId: signer.projectId };
  };

  const getOperationById = async (dto: TGetSigningOperationDTO) => {
    const signer = await signerDAL.findById(dto.signerId);
    if (!signer) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await $loadSignerResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ResourcePermissionSignerActions.Read, ResourcePermissionSub.Signer);

    const operation = await signingOperationDAL.findByIdWithActor(dto.operationId);
    if (!operation || operation.signerId !== signer.id) {
      throw new NotFoundError({ message: `Signing operation '${dto.operationId}' not found on this signer.` });
    }

    return { operation, signerName: signer.name, projectId: signer.projectId };
  };

  const $autoRenewCertificate = async (signerId: string) => {
    const signer = await $readFreshSigner(signerId);
    if (!signer) return SignerAutoRenewalOutcome.Skipped;
    if (
      signer.nextAutoRenewalAt &&
      new Date(signer.nextAutoRenewalAt).getTime() > Date.now() + AUTO_RENEWAL_DUE_MARGIN_MS
    ) {
      logger.info(
        `signer auto-renewal: signer '${signer.name}' [signerId=${signer.id}] waits until ${new Date(signer.nextAutoRenewalAt).toISOString()} before placing another automatic renewal`
      );
      return SignerAutoRenewalOutcome.Skipped;
    }

    let caId: string;
    try {
      caId = $assertRenewable(signer);
    } catch (err) {
      logger.info(
        `signer auto-renewal: skipping signer '${signer.name}' [signerId=${signer.id}]: ${(err as Error).message}`
      );
      return SignerAutoRenewalOutcome.Skipped;
    }

    const msLeft = signer.certificateNotAfter
      ? new Date(signer.certificateNotAfter).getTime() - Date.now()
      : MAX_AUTO_RENEWAL_RETRY_BACKOFF_MS;
    const retryBackoffMs = Math.min(
      MAX_AUTO_RENEWAL_RETRY_BACKOFF_MS,
      Math.max(MIN_AUTO_RENEWAL_RETRY_BACKOFF_MS, msLeft / 2)
    );
    let prepared: Awaited<ReturnType<typeof $prepareReissue>>;
    try {
      prepared = await $prepareReissue(
        signer,
        { caId },
        { isRenewal: true, nextAutoRenewalAt: new Date(Date.now() + retryBackoffMs) }
      );
    } catch (err) {
      await signerDAL.updateUnlessRevoked(signer.id, {
        certificateFailureReason: formatSignerIssuanceErrorReason(err, "Automatic renewal failed")
      });
      logger.error(err, `signer auto-renewal: renewal failed for signer '${signer.name}' [signerId=${signer.id}]`);
      return SignerAutoRenewalOutcome.Failed;
    }
    try {
      await $executeReissue(prepared);
      logger.info(
        `signer auto-renewal: renewal placed for signer '${signer.name}' [signerId=${signer.id}] [caId=${caId}]`
      );
      return SignerAutoRenewalOutcome.Renewed;
    } catch (err) {
      logger.error(err, `signer auto-renewal: renewal failed for signer '${signer.name}' [signerId=${signer.id}]`);
      return SignerAutoRenewalOutcome.Failed;
    }
  };

  const autoRenewCertificate = (signerId: string) =>
    withSignerCertificateLock(
      keyStore,
      signerId,
      () => {
        logger.info(`signer auto-renewal: signer [signerId=${signerId}] is being changed by another request, skipping`);
        return SignerAutoRenewalOutcome.Skipped;
      },
      () => $autoRenewCertificate(signerId)
    );

  const getProjectIdForSigner = async (signerId: string): Promise<string> => {
    const signer = await signerDAL.findById(signerId);
    if (!signer) throw new NotFoundError({ message: `Signer '${signerId}' not found.` });
    return signer.projectId;
  };

  const getSignerAuditContext = async (signerId: string): Promise<{ projectId: string; name: string }> => {
    const signer = await signerDAL.findById(signerId);
    if (!signer) throw new NotFoundError({ message: `Signer '${signerId}' not found.` });
    return { projectId: signer.projectId, name: signer.name };
  };

  return {
    create,
    list,
    getById,
    checkIssuanceNow,
    getMyPermissions,
    getProjectIdForSigner,
    getSignerAuditContext,
    update,
    delete: deleteSigner,
    enable,
    disable,
    reissueCertificate,
    renewCertificate,
    revokeCertificate,
    importCertificate,
    checkCertificateImport,
    exportCertificate,
    sign,
    getPublicKey,
    listOperations,
    getOperationById,
    autoRenewCertificate,
    syncPendingRevocations
  };
};
