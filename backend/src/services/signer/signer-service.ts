import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import * as x509 from "@peculiar/x509";
import { KeyObject } from "crypto";

import {
  AccessScope,
  ActionProjectType,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionSignerActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { crypto } from "@app/lib/crypto/cryptography";
import { signingService } from "@app/lib/crypto/sign/signing";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { ecdsaRawRsToDer, mapSigningAlgorithmToPkcs11Mechanism } from "@app/lib/csr/pkcs11-algorithm-map";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";

import {
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "../approval-policy/approval-policy-dal";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus
} from "../approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory, TApprovalRequestGrantsDALFactory } from "../approval-policy/approval-request-dal";
import { TCodeSigningGrantAttributes } from "../approval-policy/code-signing/code-signing-policy-types";
import { ActorType } from "../auth/auth-type";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { getCertificateCredentials } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertStatus, CrlReason } from "../certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { TDigiCertCertificateAuthorityFns } from "../certificate-authority/digicert/digicert-certificate-authority-fns";
import { TInternalCertificateAuthorityServiceFactory } from "../certificate-authority/internal/internal-certificate-authority-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { isBuiltInSignerRole, unknownSignerRoleMessage } from "../signer-membership/signer-membership-service";
import { TSignerDALFactory } from "./signer-dal";
import { CertKeySource, HsmKeyAlgorithm, SignerStatus, SigningOperationStatus } from "./signer-enums";
import { formatSignerIssuanceErrorReason } from "./signer-issuance-errors";
import {
  issueHsmBackedSignerCertificate,
  issueSignerCertificate,
  mapCertKeyAlgorithmToHsmKeyAlgorithm,
  renewHsmBackedSignerCertificate
} from "./signer-issuance-fns";
import { TSignerIssuanceServiceFactory } from "./signer-issuance-service";
import {
  SignerExternalCaConfigSchema,
  TCreateSignerDTO,
  TDeleteSignerDTO,
  TDisableSignerDTO,
  TEnableSignerDTO,
  TExportCertificateDTO,
  TGetPublicKeyDTO,
  TGetSignerDTO,
  TListSignersDTO,
  TListSigningOperationsDTO,
  TReissueCertificateDTO,
  TSignDataDTO,
  TSignerExternalCaConfig,
  TUpdateSignerDTO
} from "./signer-types";
import { TSigningOperationDALFactory } from "./signing-operation-dal";

const MAX_DATA_BYTES = 128;
const DEFAULT_CERTIFICATE_TTL_DAYS = 365;

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

const computeEffectiveStatus = (signer: {
  status: string;
  certificateNotAfter?: Date | string | null;
  certificateStatus?: string | null;
}): SignerStatus => {
  const dbStatus = signer.status as SignerStatus;
  if (dbStatus !== SignerStatus.Active) return dbStatus;
  if (signer.certificateStatus === CertStatus.REVOKED) return SignerStatus.Expired;
  if (signer.certificateNotAfter && new Date(signer.certificateNotAfter) < new Date()) {
    return SignerStatus.Expired;
  }
  return SignerStatus.Active;
};

type TSignerServiceFactoryDep = {
  signerDAL: TSignerDALFactory;
  signingOperationDAL: TSigningOperationDALFactory;
  hsmConnectorService: Pick<
    THsmConnectorServiceFactory,
    "sign" | "generateKeyPair" | "getPublicKey" | "assertAttachPermission"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  signerIssuanceService: Pick<
    TSignerIssuanceServiceFactory,
    "requestIssuance" | "getLatestIssuanceKeyConfig" | "runPendingJobNow"
  >;
  internalCertificateAuthorityService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa">;
  digicertFns: Pick<TDigiCertCertificateAuthorityFns, "revokeCertificate" | "assertCodeSigningOrderReusable">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "encryptWithKmsKey" | "generateKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "create">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "delete">;
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "create" | "find" | "delete" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete">;
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

export const resolveReissueTarget = ({
  dto,
  signer,
  currentCert
}: {
  dto: TReissueCertificateDTO;
  signer: { keyAlgorithm?: string | null };
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
    (overrideKeySource !== undefined && overrideKeySource !== currentCert?.keySource) || changingKeyAlgorithm;
  const targetIsHsm = overrideKeySource ? overrideKeySource === CertKeySource.Hsm : currentIsHsm;

  if (targetIsHsm) {
    const hsmConnectorId = dto.certificate?.hsmConnectorId ?? currentCert?.hsmConnectorId ?? null;
    const keyAlgorithm =
      dto.keyAlgorithm ?? (currentCert?.keyAlgorithm as CertKeyAlgorithm | undefined) ?? CertKeyAlgorithm.RSA_2048;
    const hsmKeyAlgorithm = mapCertKeyAlgorithmToHsmKeyAlgorithm(keyAlgorithm);
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
  signingOperationDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
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
  hsmConnectorService
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
        throw new BadRequestError({ message: "Certificate must belong to the same project" });
      }
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
      if (!dto.commonName) {
        throw new BadRequestError({ message: "commonName is required when issuing a certificate from a CA." });
      }
      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(dto.caId as string);
      if (!ca || ca.projectId !== dto.projectId) {
        throw new NotFoundError({ message: `Certificate authority '${dto.caId}' not found in this project.` });
      }
      if (ca.status !== CaStatus.ACTIVE) {
        throw new BadRequestError({ message: "The selected certificate authority is not active." });
      }
      resolvedCaId = ca.id;
      resolvedCaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
    }

    if (resolvedCaType) assertCaTypeSupportsCodeSigning(resolvedCaType);

    let createDigicertLifecycle: { mode: "reissue"; previousOrderId: number } | undefined;
    const createExternalConfig = dto.externalConfiguration;
    const reissueFromExternalOrderId =
      createExternalConfig?.caType === CaType.DIGICERT ? createExternalConfig.reissueFromExternalOrderId : undefined;
    if (reissueFromExternalOrderId) {
      if (resolvedCaType !== CaType.DIGICERT) {
        throw new BadRequestError({
          message:
            "Reissuing from an existing order is only supported for DigiCert code signing certificate authorities."
        });
      }
      const previousOrderId = Number(reissueFromExternalOrderId);
      if (!Number.isInteger(previousOrderId) || previousOrderId <= 0) {
        throw new BadRequestError({ message: "reissueFromExternalOrderId must be a valid DigiCert order id." });
      }
      await digicertFns.assertCodeSigningOrderReusable(resolvedCaId as string, previousOrderId);
      createDigicertLifecycle = { mode: "reissue", previousOrderId };
    }

    const isExternalCa = resolvedCaType !== null && resolvedCaType !== CaType.INTERNAL;

    const adcsTemplate =
      createExternalConfig?.caType === CaType.ADCS ? createExternalConfig.template?.trim() || undefined : undefined;
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

    const keyAlgorithm: CertKeyAlgorithm = (dto.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048;

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
    const initialStatus: SignerStatus = isExternalCa ? SignerStatus.Pending : SignerStatus.Active;

    try {
      const result = await signerDAL.transaction(async (tx) => {
        const project = await projectDAL.findOne({ id: dto.projectId }, tx);
        if (!project) {
          throw new NotFoundError({ message: `Project '${dto.projectId}' not found.` });
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
            certificateId: finalCertificateId,
            caId: resolvedCaId,
            commonName: usingCa ? dto.commonName : null,
            certificateTtlDays: usingCa ? (dto.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS) : null,
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
                requiredApprovals: step.requiredApprovals,
                notifyApprovers: true
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

      if (usingCa && resolvedCaId && isExternalCa && resolvedCaType) {
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
      // 23505 = unique constraint violation
      if (error instanceof DatabaseError && (error.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({ message: `A signer with the name '${dto.name}' already exists in this project` });
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

    let externalOrder: { provider: string; orderId: number; status: string | null } | null = null;
    if (!signer.certificateId) {
      const keyConfig = await signerIssuanceService.getLatestIssuanceKeyConfig(signer.id);
      if (keyConfig) {
        signer.certificateKeySource = signer.certificateKeySource ?? keyConfig.keySource;
        signer.certificateHsmConnectorId = signer.certificateHsmConnectorId ?? keyConfig.hsmConnectorId;
        signer.certificateKeyAlgorithm = signer.certificateKeyAlgorithm ?? keyConfig.keyAlgorithm;
        externalOrder = keyConfig.externalOrder;
      }
    }

    return { ...signer, status: computeEffectiveStatus(signer), externalOrder };
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

  const deleteSigner = async (dto: TDeleteSignerDTO) => {
    const existingSigner = await signerDAL.findById(dto.signerId);
    if (!existingSigner) {
      throw new NotFoundError({ message: `Signer with ID '${dto.signerId}' not found` });
    }

    const { permission } = await $loadSignerResourcePermission(
      existingSigner.id,
      existingSigner.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.Delete,
      ResourcePermissionSub.Signer
    );

    // Revoke the DigiCert order so a deleted signer can't leave a live publicly-trusted cert behind.
    // Best-effort and outside the deletion transaction so a DigiCert outage can't block the delete.
    if (existingSigner.caId && existingSigner.certificateId) {
      try {
        const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(existingSigner.caId);
        if (ca?.externalCa?.type === CaType.DIGICERT) {
          const cert = await certificateDAL.findById(existingSigner.certificateId);
          if (cert?.serialNumber && cert.status !== CertStatus.REVOKED) {
            await digicertFns.revokeCertificate({
              caId: existingSigner.caId,
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
  };

  const enable = async (dto: TEnableSignerDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ManageStatus,
      ResourcePermissionSub.Signer
    );

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
    return signerDAL.updateById(dto.signerId, { status: SignerStatus.Active });
  };

  const disable = async (dto: TDisableSignerDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ManageStatus,
      ResourcePermissionSub.Signer
    );

    if (signer.status === SignerStatus.Disabled) return signer;
    return signerDAL.updateById(dto.signerId, { status: SignerStatus.Disabled });
  };

  type TReissueExecutionContext = {
    dto: TReissueCertificateDTO;
    signer: NonNullable<Awaited<ReturnType<typeof signerDAL.findById>>>;
    reissueCaType: CaType;
    target: ReturnType<typeof resolveReissueTarget>;
    currentCert: Awaited<ReturnType<typeof certificateDAL.findById>> | null;
    recoveredKeyConfig: Awaited<ReturnType<typeof signerIssuanceService.getLatestIssuanceKeyConfig>>;
    commonName: string;
    certificateTtlDays: number;
    explicitReissueOrderId?: number;
  };

  const $reissueExternalSigner = async (ctx: TReissueExecutionContext) => {
    const { dto, signer, reissueCaType, target, currentCert, recoveredKeyConfig, commonName, certificateTtlDays } = ctx;
    const reissueHsm = target.isHsm
      ? {
          hsmConnectorId: target.hsmConnectorId,
          hsmKeyAlgorithm: target.hsmKeyAlgorithm,
          hsmKeyLabel: target.switchingKeySource
            ? undefined
            : (currentCert?.hsmKeyLabel ?? recoveredKeyConfig?.hsmKeyLabel ?? undefined),
          hsmPublicKeySpki: target.switchingKeySource
            ? undefined
            : (currentCert?.hsmPublicKeySpki ?? recoveredKeyConfig?.hsmPublicKeySpki ?? undefined),
          actor: { type: dto.actor, id: dto.actorId, authMethod: dto.actorAuthMethod, orgId: dto.actorOrgId }
        }
      : undefined;

    await signerDAL.updateById(dto.signerId, { status: SignerStatus.Pending, certificateFailureReason: null });

    const reissueDigicertOrderId =
      reissueCaType === CaType.DIGICERT
        ? (ctx.explicitReissueOrderId ?? (currentCert?.externalMetadata as { orderId?: number } | null)?.orderId)
        : undefined;
    try {
      await signerIssuanceService.requestIssuance({
        signerId: signer.id,
        projectId: signer.projectId,
        caId: dto.caId,
        commonName,
        certificateTtlDays,
        keyAlgorithm: target.keyAlgorithm,
        hsm: reissueHsm,
        digicertLifecycle: reissueDigicertOrderId
          ? { mode: "reissue", previousOrderId: reissueDigicertOrderId }
          : undefined
      });
      return await signerDAL.findById(dto.signerId);
    } catch (queueErr) {
      await signerDAL.updateById(dto.signerId, {
        status: SignerStatus.Failed,
        certificateFailureReason: formatSignerIssuanceErrorReason(
          queueErr,
          "Could not schedule re-issuance from the external Certificate Authority"
        )
      });
      throw queueErr;
    }
  };

  const $reissueInternalSigner = async (ctx: TReissueExecutionContext) => {
    const { dto, signer, target, currentCert, commonName, certificateTtlDays } = ctx;
    try {
      let certificateId: string;
      if (target.isHsm) {
        if (target.switchingKeySource || !currentCert?.hsmKeyLabel) {
          const result = await issueHsmBackedSignerCertificate(hsmCertIssuanceDeps, {
            caId: dto.caId,
            projectId: signer.projectId,
            commonName,
            certificateTtlDays,
            hsmConnectorId: target.hsmConnectorId,
            hsmKeyAlgorithm: target.hsmKeyAlgorithm
          });
          certificateId = result.certificateId;
        } else {
          const result = await renewHsmBackedSignerCertificate(hsmCertIssuanceDeps, {
            caId: dto.caId,
            projectId: signer.projectId,
            commonName,
            certificateTtlDays,
            hsmConnectorId: target.hsmConnectorId,
            hsmKeyLabel: currentCert.hsmKeyLabel,
            expectedPublicKeySpkiDer: currentCert.hsmPublicKeySpki ?? undefined,
            hsmKeyAlgorithm: target.hsmKeyAlgorithm
          });
          certificateId = result.certificateId;
        }
      } else {
        const result = await issueSignerCertificate(softwareCertIssuanceDeps, {
          caId: dto.caId,
          projectId: signer.projectId,
          commonName,
          certificateTtlDays,
          keyAlgorithm: target.keyAlgorithm
        });
        certificateId = result.certificateId;
      }

      return await signerDAL.updateById(dto.signerId, {
        certificateId,
        status: SignerStatus.Active,
        certificateFailureReason: null
      });
    } catch (issueErr) {
      logger.error(
        issueErr,
        `signer reissue: certificate issuance failed for signer '${signer.name}' [signerId=${signer.id}]`
      );
      await signerDAL.updateById(dto.signerId, {
        status: SignerStatus.Failed,
        certificateFailureReason: formatSignerIssuanceErrorReason(issueErr, "Internal CA certificate issuance failed")
      });
      throw issueErr;
    }
  };

  const reissueCertificate = async (dto: TReissueCertificateDTO) => {
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
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionSignerActions.ReissueCertificate,
      ResourcePermissionSub.Signer
    );

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(dto.caId);
    if (!ca || ca.projectId !== signer.projectId) {
      throw new NotFoundError({ message: `Certificate authority '${dto.caId}' not found in this project.` });
    }
    if (ca.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "The selected certificate authority is not active." });
    }

    const reissueCaType: CaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
    assertCaTypeSupportsCodeSigning(reissueCaType);
    const reissueIsExternal = reissueCaType !== CaType.INTERNAL;

    const reissueExternalConfig = dto.externalConfiguration;
    const reissueFromExternalOrderId =
      reissueExternalConfig?.caType === CaType.DIGICERT ? reissueExternalConfig.reissueFromExternalOrderId : undefined;
    let explicitReissueOrderId: number | undefined;
    if (reissueFromExternalOrderId) {
      if (reissueCaType !== CaType.DIGICERT) {
        throw new BadRequestError({
          message:
            "Reissuing from an existing order is only supported for DigiCert code signing certificate authorities."
        });
      }
      explicitReissueOrderId = Number(reissueFromExternalOrderId);
      if (!Number.isInteger(explicitReissueOrderId) || explicitReissueOrderId <= 0) {
        throw new BadRequestError({ message: "reissueFromExternalOrderId must be a valid DigiCert order id." });
      }
      await digicertFns.assertCodeSigningOrderReusable(ca.id, explicitReissueOrderId);
    }

    const providedAdcsTemplate =
      reissueExternalConfig?.caType === CaType.ADCS ? reissueExternalConfig.template?.trim() || undefined : undefined;
    if (providedAdcsTemplate && reissueCaType !== CaType.ADCS) {
      throw new BadRequestError({
        message:
          "A certificate template can only be set for signers backed by an Active Directory Certificate Service CA."
      });
    }
    const existingConfig = SignerExternalCaConfigSchema.safeParse(signer.externalCaConfig);
    const existingAdcsTemplate =
      existingConfig.success && existingConfig.data.caType === CaType.ADCS ? existingConfig.data.template : undefined;
    let nextExternalCaConfig: TSignerExternalCaConfig | null = null;
    if (reissueCaType === CaType.ADCS) {
      // Keep the signer's existing template when the request doesn't supply a new one.
      const template = providedAdcsTemplate ?? existingAdcsTemplate;
      if (!template) {
        throw new BadRequestError({
          message:
            "A certificate template is required for signers backed by an Active Directory Certificate Service CA."
        });
      }
      nextExternalCaConfig = { caType: CaType.ADCS, template };
    }

    let nextCommonName = signer.commonName;
    let effectiveTtl = signer.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS;
    if (!explicitReissueOrderId) {
      if (dto.commonName !== undefined) nextCommonName = dto.commonName;
      if (dto.certificateTtlDays !== undefined) effectiveTtl = dto.certificateTtlDays;
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

    const reissueCurrentCert = signer.certificateId ? await certificateDAL.findById(signer.certificateId) : null;

    // A never-issued signer has no cert to read the key config from; recover it from the last job so
    // an HSM signer keeps its key source instead of falling back to software and being rejected.
    const recoveredKeyConfig = reissueCurrentCert
      ? null
      : await signerIssuanceService.getLatestIssuanceKeyConfig(signer.id);

    const target = resolveReissueTarget({
      dto,
      signer,
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

    if (target.isHsm) {
      await hsmConnectorService.assertAttachPermission(
        { type: dto.actor, id: dto.actorId, authMethod: dto.actorAuthMethod, orgId: dto.actorOrgId },
        target.hsmConnectorId,
        signer.projectId
      );
    }

    await signerDAL.updateById(dto.signerId, {
      caId: dto.caId,
      commonName: nextCommonName,
      certificateTtlDays: effectiveTtl,
      keyAlgorithm: target.keyAlgorithm,
      externalCaConfig: nextExternalCaConfig
    });

    const reissueCtx: TReissueExecutionContext = {
      dto,
      signer,
      reissueCaType,
      target,
      currentCert: reissueCurrentCert,
      recoveredKeyConfig,
      commonName: nextCommonName,
      certificateTtlDays: effectiveTtl,
      explicitReissueOrderId
    };

    if (reissueIsExternal) {
      return $reissueExternalSigner(reissueCtx);
    }

    return $reissueInternalSigner(reissueCtx);
  };

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

    if (signer.status !== SignerStatus.Active) {
      throw new BadRequestError({ message: `Signer '${signer.name}' is not active (status: ${signer.status})` });
    }
    if (!signer.certificateId) {
      throw new BadRequestError({ message: `Signer '${signer.name}' has no certificate attached.` });
    }
    if (signer.certificateNotAfter && new Date() > new Date(signer.certificateNotAfter)) {
      throw new BadRequestError({ message: `Certificate for signer '${signer.name}' has expired` });
    }
    if (signer.certificateStatus === CertStatus.REVOKED) {
      throw new BadRequestError({
        message: `Certificate for signer '${signer.name}' has been revoked. Reissue from a CA before signing.`
      });
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

    let grantId: string | null = null;
    let matchedGrantAttrs: TCodeSigningGrantAttributes | null = null;
    let pendingOperationId: string | null = null;

    if (requiresApproval) {
      ({ grantId, matchedGrantAttrs, pendingOperationId } = await projectDAL.transaction(async (tx) => {
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

        for (const grant of activeGrants) {
          const attrs = grant.attributes as TCodeSigningGrantAttributes | null;
          if (attrs && attrs.signerId === signer.id) {
            const windowNotStarted = attrs.windowStart && new Date(attrs.windowStart) > now;
            if (!windowNotStarted) {
              if (grant.expiresAt && new Date(grant.expiresAt) < now) {
                expiredGrantIds.push(grant.id);
              } else if (!matchingGrant) {
                matchingGrant = grant;
              }
            }
          }
        }

        await Promise.all(
          expiredGrantIds.map((id) =>
            approvalRequestGrantsDAL.updateById(id, { status: ApprovalRequestGrantStatus.Expired }, tx)
          )
        );

        if (matchingGrant) {
          const lockedGrant = await approvalRequestGrantsDAL.findByIdForUpdate(matchingGrant.id, tx);
          if (!lockedGrant || lockedGrant.status !== ApprovalRequestGrantStatus.Active) {
            matchingGrant = undefined;
          } else {
            const matchAttrs = lockedGrant.attributes as TCodeSigningGrantAttributes | null;
            if (matchAttrs?.maxSignings) {
              const usedCount = await signingOperationDAL.countByGrantId(matchingGrant.id, tx);
              if (usedCount >= matchAttrs.maxSignings) {
                await approvalRequestGrantsDAL.updateById(
                  matchingGrant.id,
                  { status: ApprovalRequestGrantStatus.Expired },
                  tx
                );
                matchingGrant = undefined;
              }
            }
          }
        }

        if (!matchingGrant) {
          throw new ForbiddenRequestError({
            message:
              `Signing with signer '${signer.name}' requires approved access, but none is currently active. ` +
              `Access may not have been requested or approved yet, may have expired, or may have reached its signature limit. ` +
              `Request signing access for this signer and try again once it's approved.`,
            name: "ApprovalRequired"
          });
        }

        const pendingOp = await signingOperationDAL.create(
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
            clientMetadata: dto.clientMetadata ?? null
          },
          tx
        );

        return {
          grantId: matchingGrant.id,
          matchedGrantAttrs: matchingGrant.attributes as TCodeSigningGrantAttributes | null,
          pendingOperationId: pendingOp.id
        };
      }));
    }

    let signatureBuffer: Buffer;
    try {
      if (isHsmBacked) {
        // ECDSA signatures arrive as raw r||s; convert to ASN.1 DER for X.509 / JCE consumers.
        const mech = mapSigningAlgorithmToPkcs11Mechanism(dto.signingAlgorithm, dto.isDigest);
        let raw = await hsmConnectorService.sign({
          connectorId: certificate.hsmConnectorId as string,
          projectId,
          keyLabel: certificate.hsmKeyLabel as string,
          mechanism: mech.mechanism,
          data: dataBuffer,
          isDigest: dto.isDigest
        });
        if (mech.isEcdsa) raw = ecdsaRawRsToDer(raw);
        signatureBuffer = raw;
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
            clientMetadata: dto.clientMetadata ?? null,
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
            clientMetadata: dto.clientMetadata ?? null
          },
          tx
        );
      }

      if (grantId && matchedGrantAttrs?.maxSignings) {
        const newCount = await signingOperationDAL.countByGrantId(grantId, tx);
        if (newCount >= matchedGrantAttrs.maxSignings) {
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

    return { operations, totalCount, projectId: signer.projectId };
  };

  const attachIssuedCertificate = async (
    signerId: string,
    certificateId: string,
    tx?: Parameters<TSignerDALFactory["updateById"]>[2]
  ) => {
    return signerDAL.updateById(
      signerId,
      { certificateId, status: SignerStatus.Active, certificateFailureReason: null },
      tx
    );
  };

  const markIssuanceFailed = async (
    signerId: string,
    reason?: string,
    tx?: Parameters<TSignerDALFactory["updateById"]>[2]
  ) => {
    return signerDAL.updateById(
      signerId,
      { status: SignerStatus.Failed, certificateFailureReason: reason ? reason.slice(0, 1000) : null },
      tx
    );
  };

  const autoRenewCertificate = async (signerId: string) => {
    const signer = await signerDAL.findById(signerId);
    if (!signer) {
      logger.warn(`signer auto-renewal: signer '${signerId}' not found, skipping`);
      return;
    }
    if (!signer.caId) {
      logger.warn(
        `signer auto-renewal: signer '${signer.name}' [signerId=${signer.id}] has no CA configured, skipping`
      );
      return;
    }
    if (!signer.commonName) {
      logger.warn(`signer auto-renewal: signer '${signer.name}' [signerId=${signer.id}] has no common name, skipping`);
      return;
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(signer.caId);
    if (!ca || ca.projectId !== signer.projectId) {
      const reason = `Certificate authority '${signer.caId}' is no longer available in the project.`;
      logger.warn(`signer auto-renewal: ${reason} [signerId=${signer.id}]`);
      await signerDAL.updateById(signer.id, {
        status: SignerStatus.Failed,
        certificateFailureReason: reason.slice(0, 1000)
      });
      return;
    }
    if (ca.status !== CaStatus.ACTIVE) {
      const reason = `Certificate authority '${ca.name}' is not active.`;
      await signerDAL.updateById(signer.id, {
        status: SignerStatus.Failed,
        certificateFailureReason: reason.slice(0, 1000)
      });
      return;
    }

    const renewalCaType: CaType = (ca.externalCa?.type as CaType | undefined) ?? CaType.INTERNAL;
    try {
      assertCaTypeSupportsCodeSigning(renewalCaType);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "CA is not supported for code signing.";
      await signerDAL.updateById(signer.id, {
        status: SignerStatus.Failed,
        certificateFailureReason: reason.slice(0, 1000)
      });
      logger.warn(`signer auto-renewal: ${reason} [signerId=${signer.id}]`);
      return;
    }

    const isExternal = renewalCaType !== CaType.INTERNAL;
    const ttlDays = signer.certificateTtlDays ?? DEFAULT_CERTIFICATE_TTL_DAYS;
    const renewKeyAlgorithm: CertKeyAlgorithm = (signer.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048;

    if (isExternal) {
      const autoRenewCert = signer.certificateId ? await certificateDAL.findById(signer.certificateId) : null;
      const autoRenewHsm =
        autoRenewCert?.keySource === CertKeySource.Hsm && autoRenewCert.hsmConnectorId && autoRenewCert.keyAlgorithm
          ? {
              hsmConnectorId: autoRenewCert.hsmConnectorId,
              hsmKeyAlgorithm: mapCertKeyAlgorithmToHsmKeyAlgorithm(autoRenewCert.keyAlgorithm),
              hsmKeyLabel: autoRenewCert.hsmKeyLabel ?? undefined,
              hsmPublicKeySpki: autoRenewCert.hsmPublicKeySpki ?? undefined
            }
          : undefined;
      await signerDAL.updateById(signer.id, {
        status: SignerStatus.Pending,
        certificateFailureReason: null
      });
      const autoRenewDigicertOrderId =
        renewalCaType === CaType.DIGICERT
          ? (autoRenewCert?.externalMetadata as { orderId?: number } | null)?.orderId
          : undefined;
      try {
        await signerIssuanceService.requestIssuance({
          signerId: signer.id,
          projectId: signer.projectId,
          caId: signer.caId,
          commonName: signer.commonName,
          certificateTtlDays: ttlDays,
          keyAlgorithm: renewKeyAlgorithm,
          hsm: autoRenewHsm,
          digicertLifecycle: autoRenewDigicertOrderId
            ? { mode: "renew", previousOrderId: autoRenewDigicertOrderId }
            : undefined
        });
      } catch (err) {
        await signerDAL.updateById(signer.id, {
          status: SignerStatus.Failed,
          certificateFailureReason: formatSignerIssuanceErrorReason(
            err,
            "Could not schedule auto-renewal from the external Certificate Authority"
          )
        });
        logger.error(err, `signer auto-renewal: failed to enqueue external CA issuance [signerId=${signer.id}]`);
      }
      return;
    }

    try {
      const existingCert = signer.certificateId ? await certificateDAL.findById(signer.certificateId) : null;
      const renewIsHsm = existingCert?.keySource === CertKeySource.Hsm;
      let certificateId: string;
      if (renewIsHsm && existingCert?.hsmConnectorId && existingCert.hsmKeyLabel && existingCert.keyAlgorithm) {
        const result = await renewHsmBackedSignerCertificate(hsmCertIssuanceDeps, {
          caId: signer.caId,
          projectId: signer.projectId,
          commonName: signer.commonName,
          certificateTtlDays: ttlDays,
          hsmConnectorId: existingCert.hsmConnectorId,
          hsmKeyLabel: existingCert.hsmKeyLabel,
          expectedPublicKeySpkiDer: existingCert.hsmPublicKeySpki ?? undefined,
          hsmKeyAlgorithm: mapCertKeyAlgorithmToHsmKeyAlgorithm(existingCert.keyAlgorithm)
        });
        certificateId = result.certificateId;
      } else {
        const result = await issueSignerCertificate(softwareCertIssuanceDeps, {
          caId: signer.caId,
          projectId: signer.projectId,
          commonName: signer.commonName,
          certificateTtlDays: ttlDays,
          keyAlgorithm: renewKeyAlgorithm
        });
        certificateId = result.certificateId;
      }
      await signerDAL.updateById(signer.id, {
        certificateId,
        status: SignerStatus.Active,
        certificateFailureReason: null
      });
      logger.info(
        `signer auto-renewal: renewed signer '${signer.name}' [signerId=${signer.id}] [newCertificateId=${certificateId}]`
      );
    } catch (err) {
      await signerDAL.updateById(signer.id, {
        status: SignerStatus.Failed,
        certificateFailureReason: formatSignerIssuanceErrorReason(err, "Internal CA auto-renewal failed")
      });
      logger.error(err, `signer auto-renewal: internal CA issuance failed [signerId=${signer.id}]`);
    }
  };

  const getProjectIdForSigner = async (signerId: string): Promise<string> => {
    const signer = await signerDAL.findById(signerId);
    if (!signer) throw new NotFoundError({ message: `Signer '${signerId}' not found.` });
    return signer.projectId;
  };

  return {
    create,
    list,
    getById,
    checkIssuanceNow,
    getMyPermissions,
    getProjectIdForSigner,
    update,
    delete: deleteSigner,
    enable,
    disable,
    reissueCertificate,
    exportCertificate,
    sign,
    getPublicKey,
    listOperations,
    attachIssuedCertificate,
    markIssuanceFailed,
    autoRenewCertificate
  };
};
