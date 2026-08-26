import { ForbiddenError, subject } from "@casl/ability";
import { randomUUID } from "crypto";
import { Knex } from "knex";

import { ActionProjectType, TCertificates } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { isPqcAlgorithm } from "@app/lib/crypto/pqc/pqc-utils";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { CertKeyAlgorithm, CertSignatureAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
import {
  TCertificateAuthorityDALFactory,
  TCertificateAuthorityWithAssociatedCa
} from "@app/services/certificate-authority/certificate-authority-dal";
import { CaCapability, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { assertCaInProfileProject } from "@app/services/certificate-authority/certificate-authority-fns";
import { caSupportsCapability } from "@app/services/certificate-authority/certificate-authority-maps";
import { TInternalCertificateAuthorityServiceFactory } from "@app/services/certificate-authority/internal/internal-certificate-authority-service";
import { TCertificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import {
  EnrollmentType,
  IssuerType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import { TApiEnrollmentConfigDALFactory } from "@app/services/enrollment-config/api-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiAlertV2QueueServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-queue";
import { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateIssuanceQueueFactory } from "../certificate-authority/certificate-issuance-queue";
import {
  CertificateIssuanceOperation,
  CertSubjectAlternativeNameType,
  mapExtendedKeyUsageToLegacy,
  mapKeyUsageToLegacy
} from "../certificate-common/certificate-constants";
import {
  detectSanType,
  extractCertificateFromBuffer,
  getEffectiveAlgorithms,
  isValidRenewalTiming,
  resolveEffectiveApiConfig,
  resolveRenewedCertificateRenewBeforeDays,
  validateAlgorithmCompatibility,
  validateCaSupport
} from "../certificate-common/certificate-issuance-utils";
import {
  assertCanEditCertificate,
  assertCanEditCertificateResult
} from "../certificate-common/certificate-permission-fns";
import {
  convertExtendedKeyUsageArrayToLegacy,
  convertKeyUsageArrayToLegacy,
  normalizeDateForApi,
  removeRootCaFromChain,
  validatePqcLicense
} from "../certificate-common/certificate-utils";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import {
  attachCertificateToPendingRequest,
  markPendingRequestFailed
} from "../certificate-request/certificate-request-fns";
import { TCertificateRequestServiceFactory } from "../certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TPkiApplicationProfileDALFactory } from "../pki-application/pki-application-profile-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { addRenewedCertificateToSyncs, triggerAutoSyncForCertificate } from "../pki-sync/pki-sync-utils";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { copyMetadataFromCertificate } from "../resource-metadata/resource-metadata-fns";
import {
  assertCsrRenewalAttributes,
  buildCsrFromExistingKey,
  buildCsrRenewalCertificateRequest,
  buildRenewalAuditChanges,
  buildRenewalCertificateRequest,
  buildRenewalDistinguishedName,
  CertificateRenewalMode,
  certificateSpanToTtl,
  importKeyPairFromPem,
  isCertificateContentEdit,
  resolveRenewalKeySource,
  validateRenewalEligibility
} from "./certificate-renewal-fns";
import { processSelfSignedCertificate } from "./certificate-self-signed-fns";
import { parseExtendedKeyUsages, parseKeyUsages } from "./certificate-v3-fns";
import {
  CertificateRenewalKeySource,
  TCertificateIssuanceResponse,
  TDisableRenewalConfigDTO,
  TDisableRenewalResponse,
  TRenewalAttributes,
  TRenewalAuditChange,
  TRenewalConfigResponse,
  TRenewCertificateDTO,
  TUpdateRenewalConfigDTO
} from "./certificate-v3-types";

type TCertificateRenewalServiceFactoryDep = {
  certificateDAL: Pick<
    TCertificateDALFactory,
    | "findById"
    | "updateById"
    | "transaction"
    | "create"
    | "getRequestEnrollmentTypeByCertId"
    | "getOriginatingRequestByCertId"
  >;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  certificatePolicyService: Pick<TCertificatePolicyServiceFactory, "validateRequestAgainstPolicy" | "getPolicyById">;
  internalCaService: Pick<TInternalCertificateAuthorityServiceFactory, "signCertFromCa" | "issueCertFromCa">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findPkiSyncIdsByCertificateId" | "addCertificates" | "findByPkiSyncAndCertificate" | "updateSyncMetadata"
  >;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  projectDAL: TProjectDALFactory;
  certificateIssuanceQueue: Pick<TCertificateIssuanceQueueFactory, "queueCertificateIssuance">;
  certificateRequestService: Pick<TCertificateRequestServiceFactory, "createCertificateRequest">;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "attachCertificate" | "transitionFromPending">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete" | "find">;
  pkiAlertV2Queue?: Pick<TPkiAlertV2QueueServiceFactory, "queueCertificateEvent">;
  pkiApplicationProfileDAL: Pick<
    TPkiApplicationProfileDALFactory,
    "findAllByProfileId" | "findOneByApplicationAndProfile"
  >;
  apiEnrollmentConfigDAL: Pick<TApiEnrollmentConfigDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  resolveApplicationIdForProfile: TResolveApplicationIdForProfile;
  reportCertificateIssued: TReportCertificateIssued;
};

class RenewalBlockedError extends BadRequestError {
  readonly renewalError: string;

  constructor(renewalError: string) {
    super({ message: renewalError });
    this.renewalError = renewalError;
  }
}

type TRenewalActor = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type TResolveApplicationIdForProfile = (
  profile: { id: string; projectId: string; slug: string },
  explicitApplicationId: string | undefined,
  actorCtx: { actor: ActorType; actorId: string; actorAuthMethod: ActorAuthMethod; actorOrgId: string },
  enrollmentType: EnrollmentType
) => Promise<string | undefined>;

export type TReportCertificateIssued = (args: {
  orgId: string;
  projectId: string;
  profileId?: string;
  applicationId?: string;
  enrollmentType: EnrollmentType;
  operation: CertificateIssuanceOperation;
  actor: ActorType;
  actorId: string;
}) => Promise<void>;

export type TCertificateRenewalServiceFactory = ReturnType<typeof certificateRenewalServiceFactory>;

export const certificateRenewalServiceFactory = ({
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateProfileDAL,
  certificatePolicyService,
  internalCaService,
  permissionService,
  certificateSyncDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  kmsService,
  projectDAL,
  certificateIssuanceQueue,
  certificateRequestService,
  certificateRequestDAL,
  resourceMetadataDAL,
  pkiAlertV2Queue,
  pkiApplicationProfileDAL,
  apiEnrollmentConfigDAL,
  licenseService,
  resolveApplicationIdForProfile: $resolveApplicationIdForProfile,
  reportCertificateIssued: $reportCertificateIssued
}: TCertificateRenewalServiceFactoryDep) => {
  const $linkRenewedCertificate = async (
    {
      newCert,
      originalCert,
      finalRenewBeforeDays,
      isRenewalLinkPreset = false,
      certificateRequestId,
      certificateRequestCreatedAt,
      orgId
    }: {
      newCert: TCertificates;
      originalCert: TCertificates;
      finalRenewBeforeDays?: number;
      isRenewalLinkPreset?: boolean;
      certificateRequestId: string;
      certificateRequestCreatedAt: Date;
      orgId: string;
    },
    tx: Parameters<TCertificateDALFactory["updateById"]>[2]
  ) => {
    const renewalUpdate: {
      profileId?: string | null;
      renewedFromCertificateId?: string;
      renewBeforeDays?: number;
      applicationId?: string | null;
      orderId?: string;
    } = isRenewalLinkPreset
      ? {}
      : { profileId: originalCert.profileId || null, renewedFromCertificateId: originalCert.id };

    if (originalCert.orderId) renewalUpdate.orderId = originalCert.orderId;

    if (finalRenewBeforeDays !== undefined) renewalUpdate.renewBeforeDays = finalRenewBeforeDays;
    if (originalCert.applicationId) renewalUpdate.applicationId = originalCert.applicationId;
    if (Object.keys(renewalUpdate).length > 0) {
      await certificateDAL.updateById(newCert.id, renewalUpdate, tx);
    }

    await certificateDAL.updateById(originalCert.id, { renewedByCertificateId: newCert.id, renewalError: null }, tx);
    await addRenewedCertificateToSyncs(originalCert.id, newCert.id, { certificateSyncDAL }, tx);

    await copyMetadataFromCertificate(resourceMetadataDAL, {
      sourceCertificateId: originalCert.id,
      targetCertificateId: newCert.id,
      targetCertificateRequestId: certificateRequestId,
      targetCertificateRequestCreatedAt: certificateRequestCreatedAt,
      orgId,
      tx
    });
  };

  const $finalizeRenewal = async ({
    newCertificateId,
    originalCert,
    profile,
    certificate,
    issuingCaCertificate,
    certificateChain,
    serialNumber,
    certificateRequestId,
    commonName,
    fallbackProfileName,
    removeRootsFromChain,
    actor,
    actorId,
    actorOrgId
  }: {
    newCertificateId: string;
    originalCert: TCertificates;
    profile: { slug?: string | null; project?: { orgId?: string } | null } | null;
    certificate: string;
    issuingCaCertificate: string;
    certificateChain: string;
    serialNumber: string;
    certificateRequestId: string;
    commonName: string;
    fallbackProfileName: string;
    removeRootsFromChain?: boolean;
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
  }): Promise<TCertificateIssuanceResponse> => {
    await triggerAutoSyncForCertificate(newCertificateId, { certificateSyncDAL, pkiSyncDAL, pkiSyncQueue });

    try {
      await pkiAlertV2Queue?.queueCertificateEvent({
        certificateId: newCertificateId,
        projectId: originalCert.projectId,
        eventType: PkiAlertEventType.RENEWAL,
        applicationId: originalCert.applicationId ?? null
      });
    } catch {
      logger.debug("Failed to queue PKI renewal alert event");
    }

    await $reportCertificateIssued({
      orgId: profile?.project?.orgId ?? actorOrgId,
      projectId: originalCert.projectId,
      profileId: originalCert.profileId ?? undefined,
      applicationId: originalCert.applicationId ?? undefined,
      enrollmentType: EnrollmentType.API,
      operation: CertificateIssuanceOperation.RENEW,
      actor,
      actorId
    });

    return {
      status: CertificateRequestStatus.ISSUED,
      certificate,
      issuingCaCertificate,
      certificateChain: removeRootsFromChain ? removeRootCaFromChain(certificateChain) : certificateChain,
      serialNumber,
      certificateId: newCertificateId,
      certificateRequestId,
      projectId: originalCert.projectId,
      profileName: profile?.slug || fallbackProfileName,
      commonName
    };
  };

  const $decryptCertificatePrivateKey = async ({
    projectId,
    encryptedPrivateKey
  }: {
    projectId: string;
    encryptedPrivateKey: Buffer;
  }): Promise<string> => {
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: certificateManagerKmsId });
    const decryptedPrivateKey = await kmsDecryptor({ cipherTextBlob: encryptedPrivateKey });
    return decryptedPrivateKey.toString("utf-8");
  };

  const $completeKeyPreservingRenewal = async ({
    keySource,
    csr,
    ca,
    profile,
    policy,
    originalCert,
    certificateRequest,
    certificateSecret,
    originalCsr,
    ttl,
    notBefore,
    notAfter,
    finalRenewBeforeDays,
    effectiveKeyAlgorithm,
    effectiveSignatureAlgorithm,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    removeRootsFromChain
  }: {
    keySource: CertificateRenewalKeySource;
    csr?: string;
    ca: TCertificateAuthorityWithAssociatedCa;
    profile: Awaited<ReturnType<TCertificateProfileDALFactory["findByIdWithConfigs"]>> | null;
    policy: Awaited<ReturnType<TCertificatePolicyServiceFactory["getPolicyById"]>> | null;
    originalCert: TCertificates;
    certificateRequest: TCertificateRequest;
    certificateSecret: { encryptedPrivateKey: Buffer } | undefined;
    originalCsr: string | null;
    ttl: string;
    notBefore: Date;
    notAfter: Date;
    finalRenewBeforeDays: number | undefined;
    effectiveKeyAlgorithm: CertKeyAlgorithm;
    effectiveSignatureAlgorithm: CertSignatureAlgorithm;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    removeRootsFromChain?: boolean;
  }): Promise<TCertificateIssuanceResponse> => {
    const isCsrAuthoritative = keySource === CertificateRenewalKeySource.Csr;
    const requestedAltNames = certificateRequest.subjectAlternativeNames ?? [];

    let renewalCsr: string;
    if (isCsrAuthoritative) {
      renewalCsr = csr as string;
    } else if (certificateSecret) {
      renewalCsr = await buildCsrFromExistingKey({
        privateKeyPem: await $decryptCertificatePrivateKey({
          projectId: originalCert.projectId,
          encryptedPrivateKey: certificateSecret.encryptedPrivateKey
        }),
        keyAlgorithm: effectiveKeyAlgorithm,
        certificateRequest
      });
    } else {
      if (originalCert.altNames && requestedAltNames.length === 0) {
        throw new BadRequestError({
          message:
            "Every subject alternative name cannot be removed while reusing this certificate's key pair, because Infisical does not hold its private key and can only renew from the original signing request. Supply a CSR with the names you want, or renew with a new key pair."
        });
      }
      renewalCsr = originalCsr as string;
    }

    const subjectOverride = buildRenewalDistinguishedName(certificateRequest);

    const shouldIssueAsCA = certificateRequest.basicConstraints?.isCA === true;
    const caBasicConstraints = shouldIssueAsCA
      ? { isCA: true, pathLength: policy?.basicConstraints?.maxPathLength }
      : undefined;

    const pendingRequest = await certificateRequestService.createCertificateRequest({
      internal: true,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: originalCert.projectId,
      caId: ca.id,
      profileId: originalCert.profileId ?? undefined,
      applicationId: originalCert.applicationId ?? undefined,
      csr: renewalCsr,
      commonName: certificateRequest.commonName,
      altNames: requestedAltNames.length > 0 ? requestedAltNames : undefined,
      keyUsages: certificateRequest.keyUsages,
      extendedKeyUsages: certificateRequest.extendedKeyUsages,
      notBefore,
      notAfter,
      keyAlgorithm: effectiveKeyAlgorithm,
      signatureAlgorithm: effectiveSignatureAlgorithm,
      metadata: `Renewed from certificate ID: ${originalCert.id}`,
      status: CertificateRequestStatus.PENDING,
      ttl,
      enrollmentType: EnrollmentType.API,
      organization: certificateRequest.organization,
      organizationalUnit: certificateRequest.organizationalUnit,
      country: certificateRequest.country,
      state: certificateRequest.state,
      locality: certificateRequest.locality,
      domainComponents: certificateRequest.domainComponents,
      ...(certificateRequest.basicConstraints && { basicConstraints: certificateRequest.basicConstraints })
    });

    let certResult: Awaited<ReturnType<typeof internalCaService.signCertFromCa>>;
    try {
      certResult = await internalCaService.signCertFromCa({
        isInternal: true,
        caId: ca.id,
        csr: renewalCsr,
        subjectOverride,
        commonName: certificateRequest.commonName,
        altNames: isCsrAuthoritative ? undefined : requestedAltNames.map((san) => san.value).join(","),
        basicConstraints: caBasicConstraints,
        pathLength: certificateRequest.basicConstraints?.pathLength,
        ttl,
        notBefore: normalizeDateForApi(notBefore),
        notAfter: normalizeDateForApi(notAfter),
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages),
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages),
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm,
        isFromProfile: true,
        onPersisted: async (newCert, tx) => {
          if (keySource === CertificateRenewalKeySource.Reuse && certificateSecret) {
            await certificateSecretDAL.create(
              { certId: newCert.id, encryptedPrivateKey: certificateSecret.encryptedPrivateKey },
              tx
            );
          }

          await attachCertificateToPendingRequest(
            certificateRequestDAL,
            {
              certificateRequestId: pendingRequest.id,
              certificateId: newCert.id,
              projectId: originalCert.projectId,
              operation: CertificateIssuanceOperation.RENEW
            },
            tx
          );

          await $linkRenewedCertificate(
            {
              newCert,
              originalCert,
              finalRenewBeforeDays,
              certificateRequestId: pendingRequest.id,
              certificateRequestCreatedAt: pendingRequest.createdAt,
              orgId: actorOrgId
            },
            tx
          );
        }
      });
    } catch (err) {
      await markPendingRequestFailed(certificateRequestDAL, {
        certificateRequestId: pendingRequest.id,
        error: err,
        fallbackMessage: "Certificate renewal failed"
      });
      throw err;
    }

    return $finalizeRenewal({
      newCertificateId: certResult.certificateId,
      originalCert,
      profile: profile ?? null,
      certificate: extractCertificateFromBuffer(certResult.certificate as unknown as Buffer),
      issuingCaCertificate: extractCertificateFromBuffer(certResult.issuingCaCertificate as unknown as Buffer),
      certificateChain: extractCertificateFromBuffer(certResult.certificateChain as unknown as Buffer),
      serialNumber: certResult.serialNumber,
      certificateRequestId: pendingRequest.id,
      commonName: certResult.commonName || "",
      fallbackProfileName: "Renewed Certificate",
      removeRootsFromChain,
      actor,
      actorId,
      actorOrgId
    });
  };

  const $loadRenewalSubject = async (
    { certificateId, keySource }: { certificateId: string; keySource: CertificateRenewalKeySource },
    tx: Knex
  ) => {
    const originalCert = await certificateDAL.findById(certificateId, tx);
    if (!originalCert) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    if (!originalCert.profileId) {
      throw new ForbiddenRequestError({
        message: "Only certificates issued from a profile can be renewed"
      });
    }

    const originalSignatureAlgorithm = Object.values(CertSignatureAlgorithm).includes(
      originalCert.signatureAlgorithm as CertSignatureAlgorithm
    )
      ? (originalCert.signatureAlgorithm as CertSignatureAlgorithm)
      : undefined;
    const originalKeyAlgorithm = Object.values(CertKeyAlgorithm).includes(originalCert.keyAlgorithm as CertKeyAlgorithm)
      ? (originalCert.keyAlgorithm as CertKeyAlgorithm)
      : undefined;

    const profile = await certificateProfileDAL.findByIdWithConfigs(originalCert.profileId, tx);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }

    const originatingRequest = await certificateDAL.getOriginatingRequestByCertId(originalCert.id, tx);
    const { enrollmentType } = originatingRequest;
    if (enrollmentType && enrollmentType !== EnrollmentType.API) {
      throw new ForbiddenRequestError({
        message: `Certificate is not eligible for renewal: ${enrollmentType.toUpperCase()} certificates cannot be renewed`
      });
    }

    const certificateSecret = await certificateSecretDAL.findOne({ certId: originalCert.id }, tx);
    const originalCsr =
      !certificateSecret && keySource === CertificateRenewalKeySource.Reuse ? originatingRequest.csr : null;

    if (keySource === CertificateRenewalKeySource.Reuse && !certificateSecret && !originalCsr) {
      throw new BadRequestError({
        message:
          "This certificate's key pair cannot be reused because Infisical holds neither its private key nor the signing request it was issued from. Renew with a new key pair, or for a CA-issued certificate supply a CSR generated from the existing key."
      });
    }

    return {
      originalCert,
      profile,
      certificateSecret,
      originalCsr,
      originalSignatureAlgorithm,
      originalKeyAlgorithm
    };
  };

  const $authorizeRenewal = async (
    {
      originalCert,
      profile,
      actorCtx,
      isEditingCertificate
    }: {
      originalCert: TCertificates;
      profile: { id: string; projectId: string; slug: string };
      actorCtx: TRenewalActor;
      isEditingCertificate: boolean;
    },
    tx: Knex
  ) => {
    const { certMetadata, projectPermission } = isEditingCertificate
      ? await assertCanEditCertificate({
          certificate: originalCert,
          ...actorCtx,
          permissionService,
          resourceMetadataDAL,
          tx
        })
      : { certMetadata: [] as { key: string; value: string }[], projectPermission: undefined };

    if (originalCert.applicationId) {
      await $resolveApplicationIdForProfile(profile, originalCert.applicationId, actorCtx, EnrollmentType.API);
      return { certMetadata, projectPermission };
    }

    const { permission } = await permissionService.getProjectPermission({
      ...actorCtx,
      projectId: profile.projectId,
      actionProjectType: ActionProjectType.CertificateManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateProfileActions.IssueCert,
      subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
    );

    return { certMetadata, projectPermission };
  };

  const $resolveRenewalIssuer = async (
    {
      originalCert,
      profile,
      actorCtx,
      internal,
      requestedTtl
    }: {
      originalCert: TCertificates;
      profile: TCertificateProfileWithConfigs;
      actorCtx: TRenewalActor;
      internal: boolean;
      requestedTtl?: string;
    },
    tx: Knex
  ) => {
    const issuerType = profile.issuerType || (originalCert.caId ? IssuerType.CA : IssuerType.SELF_SIGNED);

    let ca: TCertificateAuthorityWithAssociatedCa | undefined;
    let caType: CaType | undefined;
    if (issuerType === IssuerType.CA) {
      const caId = profile.caId || originalCert.caId;
      if (!caId) {
        throw new NotFoundError({ message: "Certificate Authority ID not found" });
      }

      ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
      if (!ca) {
        throw new NotFoundError({ message: "Certificate Authority not found" });
      }

      assertCaInProfileProject(ca, profile);

      const eligibilityCheck = validateRenewalEligibility(originalCert, ca, requestedTtl);
      if (!eligibilityCheck.isEligible) {
        throw new RenewalBlockedError(`Certificate is not eligible for renewal: ${eligibilityCheck.errors.join(", ")}`);
      }

      caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
      if (caType === CaType.INTERNAL) {
        validateCaSupport(ca, "direct certificate issuance");
      }
    }

    const policyId = profile.certificatePolicyId || originalCert.certificateTemplateId;
    const policy = policyId ? await certificatePolicyService.getPolicyById({ ...actorCtx, policyId, internal }) : null;

    if (!policy) {
      throw new NotFoundError({ message: "Certificate policy not found for this profile" });
    }

    return { issuerType, ca, caType, policy };
  };

  const $buildValidatedRenewalRequest = ({
    originalCert,
    policy,
    csrRenewalRequest,
    attributes,
    keySource,
    originalSignatureAlgorithm,
    originalKeyAlgorithm
  }: {
    originalCert: TCertificates;
    policy: Parameters<TCertificatePolicyServiceFactory["validateRequestAgainstPolicy"]>[0];
    csrRenewalRequest: TCertificateRequest | null;
    attributes?: TRenewCertificateDTO["attributes"];
    keySource: CertificateRenewalKeySource;
    originalSignatureAlgorithm?: CertSignatureAlgorithm;
    originalKeyAlgorithm?: CertKeyAlgorithm;
  }) => {
    const originalTtl = certificateSpanToTtl(originalCert.notBefore, originalCert.notAfter);

    const originalRequest: TCertificateRequest = {
      commonName: originalCert.commonName || undefined,
      organization: originalCert.subjectOrganization || undefined,
      organizationalUnit: originalCert.subjectOrganizationalUnit || undefined,
      country: originalCert.subjectCountry || undefined,
      state: originalCert.subjectState || undefined,
      locality: originalCert.subjectLocality || undefined,
      domainComponents: originalCert.subjectDomainComponents
        ? originalCert.subjectDomainComponents.split(",")
        : undefined,
      keyUsages: parseKeyUsages(originalCert.keyUsages),
      extendedKeyUsages: parseExtendedKeyUsages(originalCert.extendedKeyUsages),
      subjectAlternativeNames: originalCert.altNames
        ? originalCert.altNames.split(",").map((san) => detectSanType(san.trim()))
        : [],
      validity: { ttl: originalTtl },
      signatureAlgorithm: originalSignatureAlgorithm,
      keyAlgorithm: originalKeyAlgorithm,
      ...(originalCert.isCA && {
        basicConstraints: { isCA: true, pathLength: originalCert.pathLength ?? undefined }
      })
    };

    const mergedRequest =
      csrRenewalRequest ?? buildRenewalCertificateRequest({ original: originalRequest, attributes });

    if (
      keySource === CertificateRenewalKeySource.Reuse &&
      attributes?.keyAlgorithm &&
      attributes.keyAlgorithm !== originalCert.keyAlgorithm
    ) {
      throw new BadRequestError({
        message: `The key algorithm cannot be changed to '${attributes.keyAlgorithm}' while reusing the existing key pair, which is '${originalCert.keyAlgorithm}'. Renew with a new key pair to change it.`
      });
    }

    const ttl = mergedRequest.validity?.ttl || originalTtl;
    const certificateRequest = { ...mergedRequest, validity: { ttl } };

    const validationResult = certificatePolicyService.validateRequestAgainstPolicy(policy, certificateRequest);
    if (!validationResult.isValid) {
      throw new RenewalBlockedError(`Certificate renewal failed. Errors: ${validationResult.errors.join(", ")}`);
    }

    return { certificateRequest, ttl };
  };

  const $assertKeySourceSupported = ({
    keySource,
    issuerType,
    caType,
    hasStoredKey
  }: {
    keySource: CertificateRenewalKeySource;
    issuerType: IssuerType;
    caType?: CaType;
    hasStoredKey: boolean;
  }) => {
    if (keySource === CertificateRenewalKeySource.New) return;

    if (issuerType !== IssuerType.CA) {
      if (keySource === CertificateRenewalKeySource.Csr) {
        throw new BadRequestError({
          message:
            "Self-signed certificates cannot be renewed from a signing request, because signing one requires the private key that a request does not carry. Reuse the existing key pair, or renew with a new one."
        });
      }
      if (!hasStoredKey) {
        throw new BadRequestError({
          message:
            "This self-signed certificate's key pair cannot be reused because Infisical does not hold its private key, which is what signs a self-signed certificate. Renew with a new key pair."
        });
      }
      return;
    }

    if (keySource === CertificateRenewalKeySource.Reuse && caType !== CaType.INTERNAL) {
      throw new BadRequestError({
        message: `Certificates issued by a ${caType?.toUpperCase() ?? "external"} certificate authority cannot reuse their existing key pair on renewal. Renew with a new key pair, or supply a CSR generated from the existing key.`
      });
    }
  };

  const $completeInternalCaRenewal = async ({
    ca,
    profile,
    policy,
    originalCert,
    certificateRequest,
    renewalAltNames,
    renewalBasicConstraints,
    ttl,
    notBefore,
    notAfter,
    finalRenewBeforeDays,
    effectiveSignatureAlgorithm,
    effectiveKeyAlgorithm,
    actorCtx,
    removeRootsFromChain
  }: {
    ca: TCertificateAuthorityWithAssociatedCa;
    profile: TCertificateProfileWithConfigs;
    policy: Awaited<ReturnType<TCertificatePolicyServiceFactory["getPolicyById"]>>;
    originalCert: TCertificates;
    certificateRequest: TCertificateRequest;
    renewalAltNames: { type: CertSubjectAlternativeNameType; value: string }[];
    renewalBasicConstraints: { isCA: boolean; pathLength?: number | null } | undefined;
    ttl: string;
    notBefore: Date;
    notAfter: Date;
    finalRenewBeforeDays: number | undefined;
    effectiveSignatureAlgorithm: CertSignatureAlgorithm;
    effectiveKeyAlgorithm: CertKeyAlgorithm;
    actorCtx: TRenewalActor;
    removeRootsFromChain?: boolean;
  }): Promise<TCertificateIssuanceResponse> => {
    const pendingRequest = await certificateRequestService.createCertificateRequest({
      internal: true,
      ...actorCtx,
      projectId: originalCert.projectId,
      caId: ca.id,
      profileId: originalCert.profileId ?? undefined,
      applicationId: originalCert.applicationId ?? undefined,
      commonName: certificateRequest.commonName,
      altNames: renewalAltNames.length > 0 ? renewalAltNames : undefined,
      keyUsages: certificateRequest.keyUsages,
      extendedKeyUsages: certificateRequest.extendedKeyUsages,
      notBefore,
      notAfter,
      keyAlgorithm: effectiveKeyAlgorithm,
      signatureAlgorithm: effectiveSignatureAlgorithm,
      metadata: `Renewed from certificate ID: ${originalCert.id}`,
      status: CertificateRequestStatus.PENDING,
      ttl,
      enrollmentType: EnrollmentType.API,
      organization: certificateRequest.organization,
      organizationalUnit: certificateRequest.organizationalUnit,
      country: certificateRequest.country,
      state: certificateRequest.state,
      locality: certificateRequest.locality,
      domainComponents: certificateRequest.domainComponents,
      ...(certificateRequest.basicConstraints && { basicConstraints: certificateRequest.basicConstraints })
    });

    let caResult: Awaited<ReturnType<typeof internalCaService.issueCertFromCa>>;
    try {
      caResult = await internalCaService.issueCertFromCa({
        caId: ca.id,
        friendlyName: originalCert.friendlyName || certificateRequest.commonName || "Renewed Certificate",
        commonName: certificateRequest.commonName || "",
        altNames: renewalAltNames.map((san) => san.value).join(","),
        ...(renewalBasicConstraints && {
          basicConstraints: { isCA: true, pathLength: policy?.basicConstraints?.maxPathLength },
          pathLength: renewalBasicConstraints.pathLength
        }),
        ttl,
        notBefore: normalizeDateForApi(notBefore),
        notAfter: normalizeDateForApi(notAfter),
        keyUsages: convertKeyUsageArrayToLegacy(certificateRequest.keyUsages),
        extendedKeyUsages: convertExtendedKeyUsageArrayToLegacy(certificateRequest.extendedKeyUsages),
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm,
        isFromProfile: true,
        organization: certificateRequest.organization,
        ou: certificateRequest.organizationalUnit,
        country: certificateRequest.country,
        state: certificateRequest.state,
        locality: certificateRequest.locality,
        domainComponents: certificateRequest.domainComponents,
        ...actorCtx,
        internal: true,
        onPersisted: async (newCert, tx) => {
          await attachCertificateToPendingRequest(
            certificateRequestDAL,
            {
              certificateRequestId: pendingRequest.id,
              certificateId: newCert.id,
              projectId: originalCert.projectId,
              operation: CertificateIssuanceOperation.RENEW
            },
            tx
          );

          await $linkRenewedCertificate(
            {
              newCert,
              originalCert,
              finalRenewBeforeDays,
              certificateRequestId: pendingRequest.id,
              certificateRequestCreatedAt: pendingRequest.createdAt,
              orgId: actorCtx.actorOrgId
            },
            tx
          );
        }
      });
    } catch (err) {
      await markPendingRequestFailed(certificateRequestDAL, {
        certificateRequestId: pendingRequest.id,
        error: err,
        fallbackMessage: "Certificate renewal failed"
      });
      throw err;
    }

    return $finalizeRenewal({
      newCertificateId: caResult.certificateId,
      originalCert,
      profile,
      certificate: caResult.certificate,
      issuingCaCertificate: caResult.issuingCaCertificate,
      certificateChain: caResult.certificateChain,
      serialNumber: caResult.serialNumber,
      certificateRequestId: pendingRequest.id,
      commonName: certificateRequest.commonName || "",
      fallbackProfileName: "Renewed Certificate",
      removeRootsFromChain,
      actor: actorCtx.actor,
      actorId: actorCtx.actorId,
      actorOrgId: actorCtx.actorOrgId
    });
  };

  const $assertRequestedAlgorithmsLicensed = async ({
    certificateId,
    csrRenewalRequest,
    attributes
  }: {
    certificateId: string;
    csrRenewalRequest: TCertificateRequest | null;
    attributes?: TRenewalAttributes;
  }) => {
    const requested = [
      attributes?.keyAlgorithm,
      attributes?.signatureAlgorithm,
      csrRenewalRequest?.keyAlgorithm,
      csrRenewalRequest?.signatureAlgorithm
    ].filter((algorithm): algorithm is string => typeof algorithm === "string" && isPqcAlgorithm(algorithm));

    if (!requested.length) return;

    const originalCert = await certificateDAL.findById(certificateId);
    if (!originalCert) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    for await (const keyAlgorithm of requested) {
      await validatePqcLicense({ keyAlgorithm, projectId: originalCert.projectId, projectDAL, licenseService });
    }
  };

  const renewCertificate = async ({
    certificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    internal = false,
    removeRootsFromChain,
    renewalKeySource: requestedKeySource,
    csr,
    attributes
  }: Omit<TRenewCertificateDTO, "certificateRequestId"> & {
    internal?: boolean;
  }): Promise<TCertificateIssuanceResponse> => {
    const actorCtx: TRenewalActor = { actor, actorId, actorAuthMethod, actorOrgId };
    const keySource = resolveRenewalKeySource({ renewalKeySource: requestedKeySource, csr });
    let csrRenewalRequest: TCertificateRequest | null = null;
    if (keySource === CertificateRenewalKeySource.Csr && csr) {
      assertCsrRenewalAttributes(attributes);
      csrRenewalRequest = buildCsrRenewalCertificateRequest({ csr, attributes });
    }

    const isEditingCertificate = isCertificateContentEdit({ keySource, attributes });
    let changedAttributes: TRenewalAuditChange[] = [];

    await $assertRequestedAlgorithmsLicensed({ certificateId, csrRenewalRequest, attributes });

    const runRenewal = () =>
      certificateDAL.transaction(async (tx) => {
        const {
          originalCert,
          profile,
          certificateSecret,
          originalCsr,
          originalSignatureAlgorithm,
          originalKeyAlgorithm
        } = await $loadRenewalSubject({ certificateId, keySource }, tx);

        const renewalAuth = internal
          ? undefined
          : await $authorizeRenewal({ originalCert, profile, actorCtx, isEditingCertificate }, tx);

        const { issuerType, ca, caType, policy } = await $resolveRenewalIssuer(
          {
            originalCert,
            profile,
            actorCtx,
            internal,
            requestedTtl: csrRenewalRequest?.validity?.ttl ?? attributes?.ttl
          },
          tx
        );

        const { certificateRequest, ttl } = $buildValidatedRenewalRequest({
          originalCert,
          policy,
          csrRenewalRequest,
          attributes,
          keySource,
          originalSignatureAlgorithm,
          originalKeyAlgorithm
        });

        changedAttributes = buildRenewalAuditChanges(originalCert, { ...certificateRequest, validity: { ttl } });

        if (renewalAuth?.projectPermission) {
          assertCanEditCertificateResult({
            projectPermission: renewalAuth.projectPermission,
            commonName: certificateRequest.commonName,
            altNames: (certificateRequest.subjectAlternativeNames ?? []).map((san) => san.value),
            serialNumber: originalCert.serialNumber,
            metadata: renewalAuth.certMetadata
          });
        }

        const notBefore = new Date();
        const notAfter = new Date(Date.now() + ms(ttl));

        const effectiveApiConfig = await resolveEffectiveApiConfig({
          applicationId: originalCert.applicationId ?? undefined,
          profileId: profile.id,
          profileApiConfig: profile.apiConfig,
          pkiApplicationProfileDAL,
          apiEnrollmentConfigDAL
        });
        const finalRenewBeforeDays = resolveRenewedCertificateRenewBeforeDays({
          apiConfig: effectiveApiConfig,
          previousRenewBeforeDays: originalCert.renewBeforeDays,
          ttl,
          notAfter
        });

        const { signatureAlgorithm: effectiveSignatureAlgorithm, keyAlgorithm: effectiveKeyAlgorithm } =
          getEffectiveAlgorithms(
            certificateRequest.signatureAlgorithm as CertSignatureAlgorithm,
            certificateRequest.keyAlgorithm as CertKeyAlgorithm,
            originalSignatureAlgorithm,
            originalKeyAlgorithm
          );
        const renewalAltNames = certificateRequest.subjectAlternativeNames ?? [];
        const renewalBasicConstraints = certificateRequest.basicConstraints?.isCA
          ? { isCA: true, pathLength: certificateRequest.basicConstraints.pathLength }
          : undefined;

        $assertKeySourceSupported({ keySource, issuerType, caType, hasStoredKey: Boolean(certificateSecret) });

        if (keySource !== CertificateRenewalKeySource.New && caType === CaType.INTERNAL && ca) {
          validateCaSupport(ca, "CSR signing");
          validateAlgorithmCompatibility(ca, { algorithms: policy?.algorithms } as {
            algorithms?: { signature?: string[] };
          });

          return {
            renewalMode: CertificateRenewalMode.KeyPreserving as const,
            keySource,
            csr,
            ca,
            profile,
            policy,
            originalCert,
            certificateRequest,
            certificateSecret,
            originalCsr,
            ttl,
            notBefore,
            notAfter,
            finalRenewBeforeDays,
            effectiveKeyAlgorithm,
            effectiveSignatureAlgorithm
          };
        }

        if (issuerType === IssuerType.CA) {
          if (!ca) {
            throw new NotFoundError({ message: "Certificate Authority not found for CA-signed certificate renewal" });
          }

          if (caType === CaType.INTERNAL) {
            validateAlgorithmCompatibility(ca, {
              algorithms: policy.algorithms
            } as { algorithms?: { signature?: string[] } });

            return {
              renewalMode: CertificateRenewalMode.InternalCa as const,
              ca,
              profile,
              policy,
              originalCert,
              certificateRequest,
              renewalAltNames,
              renewalBasicConstraints,
              ttl,
              notBefore,
              notAfter,
              finalRenewBeforeDays,
              effectiveSignatureAlgorithm,
              effectiveKeyAlgorithm
            };
          }
          if (caType && caSupportsCapability(caType, CaCapability.RENEW_CERTIFICATES)) {
            return {
              renewalMode: CertificateRenewalMode.ExternalCa as const,
              ca,
              profile,
              originalCert,
              certificateRequest,
              renewalAltNames,
              renewalBasicConstraints,
              effectiveSignatureAlgorithm,
              effectiveKeyAlgorithm,
              ttl
            };
          }
          throw new BadRequestError({
            message: `CA type ${String(caType)} does not support certificate renewal`
          });
        }

        const existingKeyPair =
          keySource === CertificateRenewalKeySource.Reuse && certificateSecret
            ? await importKeyPairFromPem({
                privateKeyPem: await $decryptCertificatePrivateKey({
                  projectId: originalCert.projectId,
                  encryptedPrivateKey: certificateSecret.encryptedPrivateKey
                }),
                keyAlgorithm: effectiveKeyAlgorithm
              })
            : undefined;

        const selfSignedRenewalResult = await processSelfSignedCertificate({
          certificateRequest: { ...certificateRequest, altNames: renewalAltNames },
          policy,
          profile,
          originalCert,
          effectiveAlgorithms: {
            signatureAlgorithm: effectiveSignatureAlgorithm,
            keyAlgorithm: effectiveKeyAlgorithm
          },
          certificateDAL,
          certificateBodyDAL,
          certificateSecretDAL,
          kmsService,
          projectDAL,
          tx,
          isRenewal: true,
          existingKeyPair
        });

        const certificate = selfSignedRenewalResult.selfSignedResult.certificate.toString("utf8");
        const { serialNumber } = selfSignedRenewalResult.selfSignedResult;
        const newCert = selfSignedRenewalResult.certificateData;

        const certRequestResult = await certificateRequestService.createCertificateRequest({
          internal: true,
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId,
          projectId: originalCert.projectId,
          tx,
          caId: ca?.id || originalCert.caId || undefined,
          profileId: originalCert.profileId || undefined,
          applicationId: originalCert.applicationId ?? undefined,
          commonName: certificateRequest.commonName,
          altNames: renewalAltNames.length > 0 ? renewalAltNames : undefined,
          keyUsages: certificateRequest.keyUsages,
          extendedKeyUsages: certificateRequest.extendedKeyUsages,
          notBefore: new Date(newCert.notBefore),
          notAfter: new Date(newCert.notAfter),
          keyAlgorithm: effectiveKeyAlgorithm,
          signatureAlgorithm: effectiveSignatureAlgorithm,
          metadata: `Renewed from certificate ID: ${originalCert.id}`,
          status: CertificateRequestStatus.ISSUED,
          certificateId: newCert.id,
          ttl,
          enrollmentType: EnrollmentType.API,
          organization: certificateRequest.organization,
          organizationalUnit: certificateRequest.organizationalUnit,
          country: certificateRequest.country,
          state: certificateRequest.state,
          locality: certificateRequest.locality,
          domainComponents: certificateRequest.domainComponents,
          ...(renewalBasicConstraints && { basicConstraints: renewalBasicConstraints })
        });

        await $linkRenewedCertificate(
          {
            newCert,
            originalCert,
            finalRenewBeforeDays,
            isRenewalLinkPreset: true,
            certificateRequestId: certRequestResult.id,
            certificateRequestCreatedAt: certRequestResult.createdAt,
            orgId: actorOrgId
          },
          tx
        );

        return {
          renewalMode: CertificateRenewalMode.SelfSigned as const,
          certificate,
          serialNumber,
          newCert,
          originalCert,
          profile,
          certRequestResult
        };
      });

    let renewalResult: Awaited<ReturnType<typeof runRenewal>>;
    try {
      renewalResult = await runRenewal();
    } catch (err) {
      if (err instanceof RenewalBlockedError) {
        await certificateDAL.updateById(certificateId, { renewalError: err.renewalError });
      }
      throw err;
    }

    if (renewalResult.renewalMode === CertificateRenewalMode.KeyPreserving) {
      const response = await $completeKeyPreservingRenewal({
        ...renewalResult,
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        removeRootsFromChain
      });
      return { ...response, changedAttributes };
    }

    if (renewalResult.renewalMode === CertificateRenewalMode.InternalCa) {
      const response = await $completeInternalCaRenewal({ ...renewalResult, actorCtx, removeRootsFromChain });
      return { ...response, changedAttributes };
    }

    if (renewalResult.renewalMode === CertificateRenewalMode.ExternalCa) {
      const {
        ca,
        profile,
        originalCert,
        certificateRequest: renewalRequest,
        renewalAltNames: structuredAltNames,
        renewalBasicConstraints,
        effectiveSignatureAlgorithm,
        effectiveKeyAlgorithm,
        ttl
      } = renewalResult;

      const renewalOrderId = randomUUID();

      const certificateRequest = await certificateRequestService.createCertificateRequest({
        internal: true,
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        projectId: originalCert.projectId,
        profileId: profile?.id,
        applicationId: originalCert.applicationId ?? undefined,
        caId: ca.id,
        csr,
        commonName: renewalRequest.commonName,
        altNames: structuredAltNames.length > 0 ? structuredAltNames : undefined,
        keyUsages: renewalRequest.keyUsages,
        extendedKeyUsages: renewalRequest.extendedKeyUsages,
        keyAlgorithm: effectiveKeyAlgorithm,
        signatureAlgorithm: effectiveSignatureAlgorithm,
        metadata: `Renewed from certificate ID: ${originalCert.id}`,
        status: CertificateRequestStatus.PENDING,
        ttl,
        enrollmentType: EnrollmentType.API,
        organization: renewalRequest.organization,
        organizationalUnit: renewalRequest.organizationalUnit,
        country: renewalRequest.country,
        state: renewalRequest.state,
        locality: renewalRequest.locality,
        domainComponents: renewalRequest.domainComponents,
        basicConstraints: renewalBasicConstraints
      });

      await copyMetadataFromCertificate(resourceMetadataDAL, {
        sourceCertificateId: originalCert.id,
        targetCertificateRequestId: certificateRequest.id,
        targetCertificateRequestCreatedAt: certificateRequest.createdAt,
        orgId: actorOrgId
      });

      await certificateIssuanceQueue.queueCertificateIssuance({
        certificateId: renewalOrderId,
        profileId: profile?.id || "",
        caId: ca.id,
        caType: (ca.externalCa?.type as CaType) ?? CaType.INTERNAL,
        commonName: renewalRequest.commonName || "",
        altNames: structuredAltNames,
        ttl,
        signatureAlgorithm: effectiveSignatureAlgorithm,
        keyAlgorithm: effectiveKeyAlgorithm,
        keyUsages: (renewalRequest.keyUsages ?? []).map(mapKeyUsageToLegacy),
        extendedKeyUsages: (renewalRequest.extendedKeyUsages ?? []).map(mapExtendedKeyUsageToLegacy),
        organization: renewalRequest.organization,
        organizationalUnit: renewalRequest.organizationalUnit,
        country: renewalRequest.country,
        state: renewalRequest.state,
        locality: renewalRequest.locality,
        isRenewal: true,
        originalCertificateId: certificateId,
        certificateRequestId: certificateRequest.id,
        basicConstraints: renewalBasicConstraints,
        ...(csr && { csr }),
        ...(originalCert.applicationId && { applicationId: originalCert.applicationId })
      });

      return {
        status: CertificateRequestStatus.PENDING,
        certificate: "", // External CA renewal is async
        certificateChain: "",
        issuingCaCertificate: "",
        serialNumber: "",
        certificateId: renewalOrderId,
        certificateRequestId: certificateRequest.id,
        projectId: originalCert.projectId,
        profileName: profile?.slug || "External CA Profile",
        commonName: renewalRequest.commonName || "",
        changedAttributes
      };
    }

    const response = await $finalizeRenewal({
      newCertificateId: renewalResult.newCert.id,
      originalCert: renewalResult.originalCert,
      profile: renewalResult.profile ?? null,
      certificate: renewalResult.certificate,
      issuingCaCertificate: "",
      certificateChain: renewalResult.certificate,
      serialNumber: renewalResult.serialNumber,
      certificateRequestId: renewalResult.certRequestResult?.id || "",
      commonName: renewalResult.newCert.commonName || "",
      fallbackProfileName: "Self-signed Certificate",
      removeRootsFromChain,
      actor,
      actorId,
      actorOrgId
    });
    return { ...response, changedAttributes };
  };

  const $loadCertificateForRenewalConfig = async ({
    certificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    certificateId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const certificate = await certificateDAL.findById(certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    await assertCanEditCertificate({
      certificate,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      permissionService,
      resourceMetadataDAL
    });

    if (!certificate.profileId) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate was not issued from a profile"
      });
    }

    return certificate;
  };

  const updateRenewalConfig = async ({
    certificateId,
    renewBeforeDays,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateRenewalConfigDTO): Promise<TRenewalConfigResponse> => {
    const certificate = await $loadCertificateForRenewalConfig({
      certificateId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    const enrollmentType = await certificateDAL.getRequestEnrollmentTypeByCertId(certificate.id);
    if (enrollmentType && enrollmentType !== EnrollmentType.API) {
      throw new ForbiddenRequestError({
        message: `Certificate is not eligible for auto-renewal: ${enrollmentType.toUpperCase()} certificates cannot be auto-renewed`
      });
    }

    const certificateSecret = await certificateSecretDAL.findOne({ certId: certificate.id });
    if (!certificateSecret) {
      throw new ForbiddenRequestError({
        message:
          "Certificate is not eligible for auto-renewal: certificates issued from CSR (external private key) cannot be auto-renewed"
      });
    }

    if (certificate.status !== CertStatus.ACTIVE) {
      throw new BadRequestError({
        message: `Certificate is not eligible for auto-renewal: certificate status is ${certificate.status}, must be ${CertStatus.ACTIVE}`
      });
    }

    const now = new Date();
    if (certificate.notAfter <= now) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate has expired"
      });
    }

    if (certificate.revokedAt) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate has been revoked"
      });
    }

    if (certificate.renewedByCertificateId) {
      throw new BadRequestError({
        message: "Certificate is not eligible for auto-renewal: certificate has already been renewed"
      });
    }

    const certificateTtlInDays = Math.ceil(
      (new Date(certificate.notAfter).getTime() - new Date(certificate.notBefore).getTime()) / (24 * 60 * 60 * 1000)
    );

    if (renewBeforeDays >= certificateTtlInDays) {
      throw new BadRequestError({
        message: "Invalid renewal configuration: renewal threshold exceeds certificate validity period"
      });
    }

    if (!isValidRenewalTiming(renewBeforeDays, new Date(certificate.notAfter))) {
      throw new BadRequestError({
        message: "Invalid renewal configuration: renewal would be triggered immediately or in the past"
      });
    }

    await certificateDAL.updateById(certificateId, { renewBeforeDays });

    return {
      projectId: certificate.projectId,
      renewBeforeDays,
      commonName: certificate.commonName || ""
    };
  };

  const disableRenewalConfig = async ({
    certificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDisableRenewalConfigDTO): Promise<TDisableRenewalResponse> => {
    const certificate = await $loadCertificateForRenewalConfig({
      certificateId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    await certificateDAL.updateById(certificateId, { renewBeforeDays: null });

    return {
      projectId: certificate.projectId,
      commonName: certificate.commonName || ""
    };
  };

  return {
    renewCertificate,
    updateRenewalConfig,
    disableRenewalConfig
  };
};
